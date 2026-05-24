(function () {
  var CMS = window.CMS;
  var createClass = window.createClass;
  var h = window.h;

  if (!CMS || !createClass || !h) {
    console.error('Decap CMS globals were not found before s3-media.js loaded.');
    return;
  }

  var cachedConfig = null;

  function valueToJS(value) {
    if (!value) return {};
    if (typeof value.toJS === 'function') return value.toJS();
    return value;
  }

  function fieldGet(field, key, fallback) {
    if (!field) return fallback;
    if (typeof field.get === 'function') {
      var value = field.get(key);
      return value === undefined ? fallback : value;
    }
    return field[key] === undefined ? fallback : field[key];
  }

  function getAssetUrl(asset) {
    var value = valueToJS(asset);
    if (!value.key) return '';
    var baseUrl = window.BLOG_CMS_MEDIA_BASE_URL || '';
    if (!baseUrl) return '';
    return baseUrl.replace(/\/+$/, '') + '/' + String(value.key).split('/').map(encodeURIComponent).join('/');
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/\n/g, ' ');
  }

  async function getUploadConfig() {
    if (cachedConfig) return cachedConfig;
    var response = await fetch(window.BLOG_CMS_UPLOAD_CONFIG_URL || '/api/cms/media/config');
    if (!response.ok) throw new Error('Could not load CMS media upload configuration.');
    cachedConfig = await response.json();
    if (cachedConfig.mediaBaseUrl) {
      window.BLOG_CMS_MEDIA_BASE_URL = cachedConfig.mediaBaseUrl;
    }
    return cachedConfig;
  }

  function getUploadToken() {
    return window.sessionStorage.getItem('blogCmsUploadToken') || '';
  }

  function findToken(value, depth) {
    if (!value || depth > 4) return '';

    if (typeof value === 'string') return '';
    if (typeof value !== 'object') return '';

    var direct = value.token || value.access_token || value.accessToken || value.oauthToken;
    if (typeof direct === 'string' && direct) return direct;

    for (var key in value) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      var nested = findToken(value[key], depth + 1);
      if (nested) return nested;
    }

    return '';
  }

  function getCmsGithubToken() {
    var keys = ['decap-cms-user', 'netlify-cms-user'];

    for (var index = 0; index < keys.length; index += 1) {
      var raw = window.localStorage.getItem(keys[index]);
      if (!raw) continue;

      try {
        var token = findToken(JSON.parse(raw), 0);
        if (token) return token;
      } catch (_error) {}
    }

    return '';
  }

  function setUploadToken(token) {
    if (token) window.sessionStorage.setItem('blogCmsUploadToken', token);
  }

  async function cmsJson(url, body, retried) {
    var headers = { 'content-type': 'application/json' };
    var token = getUploadToken();
    var githubToken = getCmsGithubToken();
    if (token) headers['x-cms-upload-token'] = token;
    if (githubToken) headers.authorization = 'Bearer ' + githubToken;

    var response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
    });

    if (response.status === 401 && !retried) {
      var nextToken = window.prompt('CMS upload token');
      if (nextToken) {
        setUploadToken(nextToken);
        return cmsJson(url, body, true);
      }
    }

    if (!response.ok) {
      var message = response.statusText;
      try {
        var error = await response.json();
        message = error.statusMessage || error.message || message;
      } catch (_error) {}
      throw new Error(message);
    }

    return response.json();
  }

  function backupFields(backup) {
    if (!backup || backup.status === 'disabled') return {};
    return {
      lfsPath: backup.lfsPath || '',
      backupStatus: backup.status || '',
      backupError: backup.error || '',
    };
  }

  function readImageDimensions(file) {
    return new Promise(function (resolve) {
      if (!file.type || file.type.indexOf('image/') !== 0) return resolve({});

      var image = new Image();
      var url = URL.createObjectURL(file);
      image.onload = function () {
        URL.revokeObjectURL(url);
        resolve({ width: image.naturalWidth, height: image.naturalHeight });
      };
      image.onerror = function () {
        URL.revokeObjectURL(url);
        resolve({});
      };
      image.src = url;
    });
  }

  function readVideoDimensions(file) {
    return new Promise(function (resolve) {
      if (!file.type || file.type.indexOf('video/') !== 0) return resolve({});

      var video = document.createElement('video');
      var url = URL.createObjectURL(file);
      video.preload = 'metadata';
      video.onloadedmetadata = function () {
        URL.revokeObjectURL(url);
        resolve({ width: video.videoWidth, height: video.videoHeight });
      };
      video.onerror = function () {
        URL.revokeObjectURL(url);
        resolve({});
      };
      video.src = url;
    });
  }

  async function uploadMultipart(file, onProgress) {
    var config = await getUploadConfig();
    if (file.size > config.maxUploadBytes) {
      throw new Error('File exceeds configured upload size limit.');
    }

    var upload = await cmsJson('/api/cms/media/multipart/create', {
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      size: file.size,
    });

    var partSize = upload.partSize || config.partSize;
    var parts = [];
    var uploadedBytes = 0;

    try {
      for (var start = 0, partNumber = 1; start < file.size; start += partSize, partNumber++) {
        var chunk = file.slice(start, Math.min(start + partSize, file.size));
        var signed = await cmsJson('/api/cms/media/multipart/sign-part', {
          key: upload.key,
          uploadId: upload.uploadId,
          partNumber: partNumber,
        });

        var partResponse = await fetch(signed.url, {
          method: 'PUT',
          body: chunk,
        });

        if (!partResponse.ok) {
          throw new Error('S3 rejected multipart part ' + partNumber + '.');
        }

        var etag = partResponse.headers.get('ETag');
        if (!etag) {
          throw new Error('S3 CORS must expose the ETag header for multipart uploads.');
        }

        uploadedBytes += chunk.size;
        parts.push({ ETag: etag, PartNumber: partNumber });
        onProgress(Math.round((uploadedBytes / file.size) * 100));
      }

      return cmsJson('/api/cms/media/multipart/complete', {
        key: upload.key,
        uploadId: upload.uploadId,
        filename: file.name,
        parts: parts,
      });
    } catch (error) {
      await cmsJson('/api/cms/media/multipart/abort', {
        key: upload.key,
        uploadId: upload.uploadId,
      }).catch(function () {});
      throw error;
    }
  }

  function makeMediaControl(kind) {
    return createClass({
      getInitialState: function () {
        return {
          error: '',
          progress: 0,
          uploading: false,
        };
      },

      handleUpload: async function (event) {
        var file = event.target.files && event.target.files[0];
        if (!file) return;

        this.setState({ error: '', progress: 0, uploading: true });

        try {
          var result = await uploadMultipart(file, (progress) => {
            this.setState({ progress: progress });
          });
          var existing = valueToJS(this.props.value);
          var dimensions = kind === 'image'
            ? await readImageDimensions(file)
            : await readVideoDimensions(file);

          this.props.onChange(Object.assign({}, existing, dimensions, {
            provider: 's3',
            key: result.key,
            filename: file.name,
            contentType: file.type || '',
            size: file.size,
          }, backupFields(result.backup)));
          this.setState({
            progress: 100,
            uploading: false,
            error: result.backup && result.backup.status === 'failed'
              ? 'Uploaded to S3, but Git LFS backup failed: ' + (result.backup.error || 'unknown error')
              : '',
          });
        } catch (error) {
          this.setState({
            error: error && error.message ? error.message : String(error),
            uploading: false,
          });
        } finally {
          event.target.value = '';
        }
      },

      handleAltChange: function (event) {
        var existing = valueToJS(this.props.value);
        this.props.onChange(Object.assign({}, existing, { alt: event.target.value }));
      },

      handleClear: function () {
        this.props.onChange(null);
      },

      handleRetryBackup: async function () {
        var asset = valueToJS(this.props.value);
        if (!asset.key) return;

        this.setState({ error: '', progress: 0, uploading: true });

        try {
          var backup = await cmsJson('/api/cms/media/backup', {
            key: asset.key,
            filename: asset.filename || '',
          });

          this.props.onChange(Object.assign({}, asset, backupFields(backup)));
          this.setState({
            progress: backup.status === 'failed' ? 0 : 100,
            uploading: false,
            error: backup.status === 'failed'
              ? 'Git LFS backup failed: ' + (backup.error || 'unknown error')
              : '',
          });
        } catch (error) {
          this.setState({
            error: error && error.message ? error.message : String(error),
            uploading: false,
          });
        }
      },

      isValid: function () {
        var value = valueToJS(this.props.value);
        var required = fieldGet(this.props.field, 'required', true);
        if (required && !value.key) {
          return { error: { message: 'Upload a file.' } };
        }
        return true;
      },

      renderPreview: function (asset) {
        var url = getAssetUrl(asset);
        if (!url) return null;

        if (kind === 'image') {
          return h('img', {
            src: url,
            alt: asset.alt || '',
            style: {
              display: 'block',
              maxWidth: '100%',
              maxHeight: '220px',
              marginTop: '12px',
              border: '1px solid #ddd',
            },
          });
        }

        return h('video', {
          src: url,
          controls: true,
          style: {
            display: 'block',
            maxWidth: '100%',
            maxHeight: '260px',
            marginTop: '12px',
            border: '1px solid #ddd',
          },
        });
      },

      render: function () {
        var asset = valueToJS(this.props.value);
        var accept = fieldGet(this.props.field, 'accept', kind === 'image' ? 'image/*' : 'video/*');
        var label = asset.key ? asset.key : 'No S3 object selected';
        var backupLabel = asset.lfsPath
          ? (asset.backupStatus === 'failed' ? 'Git LFS backup failed: ' : 'Git LFS backup: ') + asset.lfsPath
          : '';

        return h('div', { className: this.props.classNameWrapper },
          h('input', {
            id: this.props.forID,
            type: 'file',
            accept: accept,
            disabled: this.state.uploading,
            onChange: this.handleUpload,
          }),
          h('div', { style: { marginTop: '8px', fontSize: '12px', color: '#555', wordBreak: 'break-all' } }, label),
          backupLabel
            ? h('div', {
                style: {
                  marginTop: '4px',
                  fontSize: '12px',
                  color: asset.backupStatus === 'failed' ? '#b00020' : '#555',
                  wordBreak: 'break-all',
                },
              }, backupLabel)
            : null,
          this.state.uploading
            ? h('progress', { value: this.state.progress, max: 100, style: { width: '100%', marginTop: '8px' } })
            : null,
          asset.key
            ? h('input', {
                type: 'text',
                value: asset.alt || '',
                placeholder: kind === 'image' ? 'Alt text' : 'Description',
                onChange: this.handleAltChange,
                style: { width: '100%', marginTop: '8px' },
              })
            : null,
          this.renderPreview(asset),
          asset.key
            ? h('button', { type: 'button', onClick: this.handleClear, style: { marginTop: '8px' } }, 'Clear')
            : null,
          asset.key && asset.backupStatus === 'failed'
            ? h('button', {
                type: 'button',
                disabled: this.state.uploading,
                onClick: this.handleRetryBackup,
                style: { marginTop: '8px', marginLeft: '8px' },
              }, 'Retry Git LFS backup')
            : null,
          this.state.error
            ? h('div', { style: { marginTop: '8px', color: '#b00020' } }, this.state.error)
            : null
        );
      },
    });
  }

  var MediaPreview = createClass({
    render: function () {
      var asset = valueToJS(this.props.value);
      var url = getAssetUrl(asset);
      if (!url) return h('span', {}, asset.key || '');
      if (asset.contentType && asset.contentType.indexOf('video/') === 0) {
        return h('video', { src: url, controls: true, style: { maxWidth: '100%' } });
      }
      return h('img', { src: url, alt: asset.alt || '', style: { maxWidth: '100%' } });
    },
  });

  CMS.registerWidget('s3-image', makeMediaControl('image'), MediaPreview);
  CMS.registerWidget('s3-video', makeMediaControl('video'), MediaPreview);

  CMS.registerEditorComponent({
    id: 's3-image',
    label: 'S3 Image',
    fields: [
      { name: 'asset', label: 'Image', widget: 's3-image' },
    ],
    pattern: /^::s3-image\{objectKey="([^"]+)"(?: alt="([^"]*)")?(?: width="([^"]*)")?(?: height="([^"]*)")?\}\n::$/m,
    fromBlock: function (match) {
      return {
        asset: {
          provider: 's3',
          key: match[1],
          alt: match[2] || '',
          width: match[3] ? Number(match[3]) : undefined,
          height: match[4] ? Number(match[4]) : undefined,
        },
      };
    },
    toBlock: function (data) {
      var asset = valueToJS(data.asset);
      if (!asset.key) return '';
      var attrs = 'objectKey="' + escapeAttr(asset.key) + '"';
      if (asset.alt) attrs += ' alt="' + escapeAttr(asset.alt) + '"';
      if (asset.width) attrs += ' width="' + escapeAttr(asset.width) + '"';
      if (asset.height) attrs += ' height="' + escapeAttr(asset.height) + '"';
      return '::s3-image{' + attrs + '}\n::';
    },
    toPreview: function (data) {
      var asset = valueToJS(data.asset);
      var url = getAssetUrl(asset);
      return url
        ? '<img src="' + escapeAttr(url) + '" alt="' + escapeAttr(asset.alt || '') + '" style="max-width:100%;">'
        : '<code>' + escapeHtml(asset.key || '') + '</code>';
    },
  });

  CMS.registerEditorComponent({
    id: 's3-video',
    label: 'S3 Video',
    fields: [
      { name: 'asset', label: 'Video', widget: 's3-video' },
      { name: 'posterKey', label: 'Poster object key', widget: 'string', required: false },
    ],
    pattern: /^::s3-video\{objectKey="([^"]+)"(?: posterKey="([^"]*)")?(?: description="([^"]*)")?\}\n::$/m,
    fromBlock: function (match) {
      return {
        asset: {
          provider: 's3',
          key: match[1],
          alt: match[3] || '',
        },
        posterKey: match[2] || '',
      };
    },
    toBlock: function (data) {
      var asset = valueToJS(data.asset);
      if (!asset.key) return '';
      var attrs = 'objectKey="' + escapeAttr(asset.key) + '"';
      if (data.posterKey) attrs += ' posterKey="' + escapeAttr(data.posterKey) + '"';
      if (asset.alt) attrs += ' description="' + escapeAttr(asset.alt) + '"';
      return '::s3-video{' + attrs + '}\n::';
    },
    toPreview: function (data) {
      var asset = valueToJS(data.asset);
      var url = getAssetUrl(asset);
      return url
        ? '<video src="' + escapeAttr(url) + '" controls style="max-width:100%;"></video>'
        : '<code>' + escapeHtml(asset.key || '') + '</code>';
    },
  });
})();
