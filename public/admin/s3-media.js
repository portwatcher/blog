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

  function isRenderableUrl(value) {
    return /^(?:https?:|blob:|data:)/i.test(value) || value.indexOf('/') === 0;
  }

  function getAssetPublicUrl(asset) {
    var value = valueToJS(asset);
    return value.url || value.publicUrl || getAssetUrl(value);
  }

  function getAssetPreviewUrl(asset) {
    var value = valueToJS(asset);
    var previewUrl = value.previewUrl || getAssetPublicUrl(value);
    if (previewUrl && isRenderableUrl(previewUrl)) return previewUrl;
    if (value.path && isRenderableUrl(value.path)) return value.path;
    return '';
  }

  function getAssetCopyUrl(asset) {
    var value = valueToJS(asset);
    return getAssetPublicUrl(value) || getAssetPreviewUrl(value) || value.key || value.path || '';
  }

  function getAssetInsertUrl(asset) {
    var value = valueToJS(asset);
    return getAssetPublicUrl(value) || value.path || value.key || '';
  }

  function assetToWidgetValue(asset, fallbackKind) {
    var value = valueToJS(asset);
    var kind = getMediaKind(value, fallbackKind);
    return {
      provider: 's3',
      key: value.key || value.objectKey || '',
      url: value.url || '',
      previewUrl: value.previewUrl || '',
      filename: value.filename || value.name || '',
      name: value.name || value.filename || '',
      contentType: value.contentType || '',
      size: value.size,
      width: value.width,
      height: value.height,
      kind: kind,
      alt: value.alt || '',
    };
  }

  function getMediaKind(fileOrAsset, fallback) {
    var value = fileOrAsset || {};
    var contentType = value.type || value.contentType || '';
    var name = value.name || value.filename || value.key || value.path || value.url || '';

    if (contentType.indexOf('image/') === 0) return 'image';
    if (contentType.indexOf('video/') === 0) return 'video';
    if (/\.(avif|bmp|gif|jpe?g|png|svg|tiff?|webp)$/i.test(name)) return 'image';
    if (/\.(m4v|mov|mp4|mpeg|mpg|ogg|ogv|webm)$/i.test(name)) return 'video';

    return fallback || 'file';
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

  function fileListToArray(fileList) {
    return Array.prototype.slice.call(fileList || []);
  }

  function getTransferMediaFiles(dataTransfer) {
    if (!dataTransfer) return [];

    var files = fileListToArray(dataTransfer.files).filter(function (file) {
      return getMediaKind(file) !== 'file';
    });
    if (files.length) return files;

    return fileListToArray(dataTransfer.items)
      .filter(function (item) {
        return item.kind === 'file' && getMediaKind({ type: item.type }) !== 'file';
      })
      .map(function (item) {
        return item.getAsFile();
      })
      .filter(Boolean);
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

  function getCmsAuthHeaders() {
    var headers = {};
    var token = getUploadToken();
    var githubToken = getCmsGithubToken();
    if (token) headers['x-cms-upload-token'] = token;
    if (githubToken) headers.authorization = 'Bearer ' + githubToken;
    return headers;
  }

  async function cmsFetchJson(url, options, retried) {
    var requestOptions = options || {};
    var headers = Object.assign({}, requestOptions.headers || {}, getCmsAuthHeaders());

    var response = await fetch(url, {
      method: requestOptions.method || 'GET',
      headers: headers,
      body: requestOptions.body,
    });

    if (response.status === 401 && !retried) {
      var nextToken = window.prompt('CMS upload token');
      if (nextToken) {
        setUploadToken(nextToken);
        return cmsFetchJson(url, options, true);
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

  async function cmsJson(url, body, retried) {
    return cmsFetchJson(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }, retried);
  }

  async function cmsGetJson(url, retried) {
    return cmsFetchJson(url, { method: 'GET' }, retried);
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

  function makeMdcBlock(asset, kind) {
    var attrs = 'objectKey="' + escapeAttr(asset.key) + '"';
    if (asset.alt) attrs += kind === 'video'
      ? ' description="' + escapeAttr(asset.alt) + '"'
      : ' alt="' + escapeAttr(asset.alt) + '"';
    if (kind === 'image') {
      if (asset.width) attrs += ' width="' + escapeAttr(asset.width) + '"';
      if (asset.height) attrs += ' height="' + escapeAttr(asset.height) + '"';
    }
    return '::s3-' + kind + '{' + attrs + '}\n::';
  }

  function withBlockSpacing(block) {
    return '\n\n' + block + '\n\n';
  }

  function setRawEditorStatus(root, message, isError) {
    if (!root) return;

    var status = root.querySelector('.blog-cms-upload-status');
    if (!status) {
      status = document.createElement('div');
      status.className = 'blog-cms-upload-status';
      root.appendChild(status);
    }

    status.textContent = message || '';
    status.dataset.visible = message ? 'true' : 'false';
    status.dataset.error = isError ? 'true' : 'false';

    if (message && !isError) {
      window.clearTimeout(status._hideTimer);
      status._hideTimer = window.setTimeout(function () {
        status.dataset.visible = 'false';
      }, 2400);
    }
  }

  function getRawEditorRoot(target) {
    if (!target || !target.closest) return null;
    var root = target.closest('.cms-editor-raw');
    if (!root || root.closest('.blog-cms-media-library')) return null;
    return root;
  }

  function getEditableTarget(root) {
    if (!root) return null;
    return root.querySelector('[contenteditable="true"], textarea');
  }

  function captureInsertionPoint(target) {
    if (!target) return null;

    if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
      return {
        type: 'field',
        start: target.selectionStart || 0,
        end: target.selectionEnd || target.selectionStart || 0,
      };
    }

    var selection = window.getSelection && window.getSelection();
    if (!selection || !selection.rangeCount) return null;

    var range = selection.getRangeAt(0);
    if (!target.contains(range.commonAncestorContainer)) return null;
    return { type: 'range', range: range.cloneRange() };
  }

  function restoreInsertionPoint(target, insertionPoint) {
    if (!target || !insertionPoint) return;

    if (insertionPoint.type === 'field') {
      target.selectionStart = insertionPoint.start;
      target.selectionEnd = insertionPoint.end;
      return;
    }

    if (insertionPoint.type === 'range') {
      var selection = window.getSelection && window.getSelection();
      if (!selection) return;
      selection.removeAllRanges();
      selection.addRange(insertionPoint.range);
    }
  }

  function insertTextAtTarget(target, text, insertionPoint) {
    if (!target) return false;

    target.focus();
    restoreInsertionPoint(target, insertionPoint);

    if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
      var start = target.selectionStart || 0;
      var end = target.selectionEnd || start;
      var value = target.value || '';
      target.value = value.slice(0, start) + text + value.slice(end);
      target.selectionStart = target.selectionEnd = start + text.length;
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }

    if (document.execCommand) {
      return document.execCommand('insertText', false, text);
    }

    return false;
  }

  async function uploadFileToAsset(file, onProgress) {
    var kind = getMediaKind(file);
    var result = await uploadMultipart(file, onProgress || function () {});
    var dimensions = kind === 'image'
      ? await readImageDimensions(file)
      : await readVideoDimensions(file);

    var publicUrl = result.publicUrl || getAssetUrl({ key: result.key });

    return Object.assign({}, dimensions, {
      provider: 's3',
      key: result.key,
      url: publicUrl,
      previewUrl: result.previewUrl || publicUrl,
      filename: file.name,
      name: file.name,
      contentType: file.type || '',
      size: file.size,
      kind: kind,
      source: 'Uploaded this session',
    }, backupFields(result.backup));
  }

  async function uploadFilesForRawEditor(root, files) {
    var editable = getEditableTarget(root);
    if (!editable || !files.length) return;
    var insertionPoint = captureInsertionPoint(editable);

    for (var index = 0; index < files.length; index += 1) {
      var file = files[index];
      var kind = getMediaKind(file);

      try {
        setRawEditorStatus(root, 'Uploading ' + file.name + '...', false);
        var asset = await uploadFileToAsset(file, function (progress) {
          setRawEditorStatus(root, 'Uploading ' + file.name + ' (' + progress + '%)...', false);
        });
        insertTextAtTarget(editable, withBlockSpacing(makeMdcBlock(asset, kind)), insertionPoint);
        insertionPoint = captureInsertionPoint(editable);
        setRawEditorStatus(root, 'Inserted ' + file.name + '.', false);
      } catch (error) {
        setRawEditorStatus(
          root,
          error && error.message ? error.message : String(error),
          true
        );
      }
    }
  }

  function registerRawMarkdownUploadHandlers() {
    document.addEventListener('paste', function (event) {
      var root = getRawEditorRoot(event.target);
      if (!root) return;

      var files = getTransferMediaFiles(event.clipboardData);
      if (!files.length) return;

      event.preventDefault();
      uploadFilesForRawEditor(root, files);
    }, true);

    document.addEventListener('dragover', function (event) {
      var root = getRawEditorRoot(event.target);
      if (!root || !getTransferMediaFiles(event.dataTransfer).length) return;

      event.preventDefault();
      root.dataset.draggingMedia = 'true';
    }, true);

    document.addEventListener('dragleave', function (event) {
      var root = getRawEditorRoot(event.target);
      if (!root) return;
      root.dataset.draggingMedia = 'false';
    }, true);

    document.addEventListener('drop', function (event) {
      var root = getRawEditorRoot(event.target);
      if (!root) return;

      var files = getTransferMediaFiles(event.dataTransfer);
      if (!files.length) return;

      event.preventDefault();
      root.dataset.draggingMedia = 'false';
      uploadFilesForRawEditor(root, files);
    }, true);
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
            url: result.publicUrl || getAssetUrl({ key: result.key }),
            previewUrl: result.previewUrl || result.publicUrl || getAssetUrl({ key: result.key }),
            filename: file.name,
            name: file.name,
            contentType: file.type || '',
            size: file.size,
            kind: kind,
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

      handleChooseExisting: function () {
        var component = this;

        openMediaAssetsDialog({
          kind: kind,
          selectLabel: kind === 'image' ? 'Use image' : 'Use video',
          onSelect: function (asset) {
            if (!asset.key) {
              component.setState({ error: 'Selected asset is not an S3 object.' });
              return;
            }

            var existing = valueToJS(component.props.value);
            var nextAsset = assetToWidgetValue(asset, kind);

            component.props.onChange(Object.assign({}, existing, nextAsset, {
              alt: existing.alt || nextAsset.alt || '',
            }));
            component.setState({ error: '' });
          },
        });
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
        var url = getAssetPreviewUrl(asset);
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
          h('button', {
            type: 'button',
            disabled: this.state.uploading,
            onClick: this.handleChooseExisting,
            style: { marginLeft: '8px' },
          }, kind === 'image' ? 'Choose existing image' : 'Choose existing video'),
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
      var url = getAssetPreviewUrl(asset);
      if (!url) return h('span', {}, asset.key || '');
      if (getMediaKind(asset) === 'video') {
        return h('video', { src: url, controls: true, style: { maxWidth: '100%' } });
      }
      return h('img', { src: url, alt: asset.alt || '', style: { maxWidth: '100%' } });
    },
  });

  function injectAdminMediaStyles() {
    if (document.getElementById('blog-cms-media-styles')) return;

    var style = document.createElement('style');
    style.id = 'blog-cms-media-styles';
    style.textContent = [
      '.blog-cms-upload-status{position:absolute;right:12px;bottom:12px;z-index:10;max-width:min(420px,calc(100% - 24px));padding:8px 10px;border:1px solid #d9dee7;border-radius:6px;background:#f8fafc;color:#2f3b3f;font:12px/1.4 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 4px 12px rgba(15,23,42,.12);opacity:0;transform:translateY(4px);pointer-events:none;transition:opacity .16s ease,transform .16s ease;}',
      '.blog-cms-upload-status[data-visible="true"]{opacity:1;transform:translateY(0);}',
      '.blog-cms-upload-status[data-error="true"]{border-color:#f2b8b5;background:#fff1f0;color:#9f1d1d;}',
      '.cms-editor-raw[data-dragging-media="true"] [contenteditable="true"],.cms-editor-raw[data-dragging-media="true"] textarea{outline:2px solid #3a6ea5;outline-offset:-2px;background:#f7fbff;}',
      '.blog-cms-media-library{position:fixed;inset:0;z-index:99999;background:rgba(12,17,19,.58);display:flex;align-items:center;justify-content:center;padding:32px;}',
      '.blog-cms-media-dialog{width:min(1280px,calc(100vw - 64px));height:min(820px,calc(100vh - 64px));background:#fdfdfb;color:#2f3b3f;border-radius:6px;box-shadow:0 24px 80px rgba(0,0,0,.34);display:grid;grid-template-rows:auto auto 1fr;}',
      '.blog-cms-media-header,.blog-cms-media-tools{display:flex;align-items:center;gap:12px;padding:18px 22px;}',
      '.blog-cms-media-header{justify-content:space-between;border-bottom:1px solid #e7e9ed;}',
      '.blog-cms-media-header h2{margin:0;font:700 22px/1.2 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
      '.blog-cms-media-close{border:0;background:transparent;font-size:30px;line-height:1;cursor:pointer;color:#1f2a2d;padding:4px 8px;}',
      '.blog-cms-media-tools{border-bottom:1px solid #eceef2;flex-wrap:wrap;}',
      '.blog-cms-media-search{flex:1 1 280px;min-width:220px;border:1px solid #dce1e8;border-radius:6px;padding:11px 12px;font:15px system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
      '.blog-cms-media-button{border:0;border-radius:5px;padding:11px 14px;background:#2f3b3f;color:#fff;font:700 14px system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer;}',
      '.blog-cms-media-button.secondary{background:#eef1f6;color:#657080;}',
      '.blog-cms-media-button:disabled{opacity:.5;cursor:not-allowed;}',
      '.blog-cms-media-body{overflow:auto;padding:18px 22px;}',
      '.blog-cms-media-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px;}',
      '.blog-cms-asset-card{border:1px solid #e2e6ec;background:#fff;border-radius:6px;padding:0;text-align:left;cursor:pointer;overflow:hidden;min-width:0;}',
      '.blog-cms-asset-card[data-selected="true"]{border-color:#2f6fad;box-shadow:0 0 0 2px rgba(47,111,173,.24);}',
      '.blog-cms-asset-preview{aspect-ratio:16/10;background:#f1f3f6;display:flex;align-items:center;justify-content:center;color:#697483;font:700 13px system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
      '.blog-cms-asset-preview img,.blog-cms-asset-preview video{width:100%;height:100%;object-fit:cover;display:block;}',
      '.blog-cms-asset-meta{padding:10px 11px;display:grid;gap:5px;}',
      '.blog-cms-asset-name{font:700 13px/1.25 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#2f3b3f;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.blog-cms-asset-source{font:12px/1.3 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#6f7987;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.blog-cms-media-empty{height:100%;min-height:320px;display:flex;align-items:center;justify-content:center;text-align:center;color:#5f6975;font:700 18px system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
      '.blog-cms-media-error{color:#9f1d1d;font:14px/1.4 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
      '@media (max-width:700px){.blog-cms-media-library{padding:12px}.blog-cms-media-dialog{width:100%;height:100%;}.blog-cms-media-header,.blog-cms-media-tools{padding:14px}.blog-cms-media-body{padding:14px}.blog-cms-media-grid{grid-template-columns:repeat(auto-fill,minmax(140px,1fr));}}',
    ].join('\n');
    document.head.appendChild(style);
  }

  function openMediaAssetsDialog(dialogOptions) {
    var options = dialogOptions || {};
    var handleInsert = options.handleInsert;
    var onSelect = options.onSelect;
    var state = {
      assets: [],
      error: '',
      kind: options.kind || (options.imagesOnly ? 'image' : ''),
      insertMode: !!options.insertMode,
      loading: false,
      query: '',
      selectedId: '',
      uploading: false,
      uploadProgress: 0,
    };
    var overlay;
    var fileInput;

    injectAdminMediaStyles();

    function selectedAsset() {
      return state.assets.find(function (asset) {
        return asset.id === state.selectedId;
      });
    }

    function filteredAssets() {
      var query = state.query.trim().toLowerCase();
      return state.assets.filter(function (asset) {
        if (state.kind && asset.kind !== state.kind) return false;
        if (!query) return true;
        return [
          asset.name,
          asset.path,
          asset.url,
          asset.key,
          asset.source,
          asset.postTitle,
        ].some(function (value) {
          return String(value || '').toLowerCase().indexOf(query) !== -1;
        });
      });
    }

    function renderPreview(asset) {
      var url = escapeAttr(getAssetPreviewUrl(asset));
      if (asset.kind === 'image' && url) {
        return '<img src="' + url + '" alt="">';
      }
      if (asset.kind === 'video' && url) {
        return '<video src="' + url + '" muted playsinline preload="metadata"></video>';
      }
      return escapeHtml((asset.kind || 'file').toUpperCase());
    }

    function emptyMessage() {
      if (state.kind === 'image') return 'No images found. Upload an image here or paste/drop one in a post.';
      if (state.kind === 'video') return 'No videos found. Upload a video here or paste/drop one in a post.';
      return 'No media assets found. Paste, drop, or upload an image/video in a post to add one.';
    }

    function renderGrid() {
      if (state.loading) {
        return '<div class="blog-cms-media-empty">Loading media assets...</div>';
      }
      if (state.error) {
        return '<div class="blog-cms-media-empty"><span class="blog-cms-media-error">' + escapeHtml(state.error) + '</span></div>';
      }

      var assets = filteredAssets();
      if (!assets.length) {
        return '<div class="blog-cms-media-empty">' + escapeHtml(emptyMessage()) + '</div>';
      }

      return '<div class="blog-cms-media-grid">' + assets.map(function (asset) {
        var source = asset.postTitle
          ? asset.source + ': ' + asset.postTitle
          : asset.source || asset.path || asset.url || '';
        return [
          '<button type="button" class="blog-cms-asset-card" data-asset-id="' + escapeAttr(asset.id) + '" data-selected="' + String(asset.id === state.selectedId) + '">',
          '<span class="blog-cms-asset-preview">' + renderPreview(asset) + '</span>',
          '<span class="blog-cms-asset-meta">',
          '<span class="blog-cms-asset-name" title="' + escapeAttr(asset.name || asset.path || asset.url || '') + '">' + escapeHtml(asset.name || asset.path || asset.url || 'Media asset') + '</span>',
          '<span class="blog-cms-asset-source" title="' + escapeAttr(source) + '">' + escapeHtml(source) + '</span>',
          '</span>',
          '</button>',
        ].join('');
      }).join('') + '</div>';
    }

    function uploadAccept() {
      if (state.kind === 'image') return 'image/*';
      if (state.kind === 'video') return 'video/*';
      return 'image/*,video/*';
    }

    function render() {
      var selected = selectedAsset();
      var canUseSelected = !!selected;
      var canInsert = canUseSelected && (!!onSelect || (state.insertMode && !!handleInsert));
      var uploadLabel = state.uploading
        ? 'Uploading ' + state.uploadProgress + '%'
        : 'Upload';
      var selectLabel = options.selectLabel || 'Insert selected';

      overlay.innerHTML = [
        '<div class="blog-cms-media-dialog" role="dialog" aria-modal="true" aria-label="Media assets">',
        '<div class="blog-cms-media-header">',
        '<h2>Media assets</h2>',
        '<button type="button" class="blog-cms-media-close" data-action="close" aria-label="Close">×</button>',
        '</div>',
        '<div class="blog-cms-media-tools">',
        '<input class="blog-cms-media-search" type="search" placeholder="Search by file, path, or post..." value="' + escapeAttr(state.query) + '">',
        '<button type="button" class="blog-cms-media-button secondary" data-action="copy" ' + (canUseSelected ? '' : 'disabled') + '>Copy URL</button>',
        '<button type="button" class="blog-cms-media-button secondary" data-action="download" ' + (canUseSelected ? '' : 'disabled') + '>Download</button>',
        '<button type="button" class="blog-cms-media-button" data-action="insert" ' + (canInsert ? '' : 'disabled') + '>' + escapeHtml(selectLabel) + '</button>',
        '<button type="button" class="blog-cms-media-button" data-action="upload" ' + (state.uploading ? 'disabled' : '') + '>' + escapeHtml(uploadLabel) + '</button>',
        '</div>',
        '<div class="blog-cms-media-body">' + renderGrid() + '</div>',
        '<input class="blog-cms-media-file" type="file" accept="' + escapeAttr(uploadAccept()) + '" multiple hidden>',
        '</div>',
      ].join('');

      fileInput = overlay.querySelector('.blog-cms-media-file');
      overlay.querySelector('.blog-cms-media-search').focus();
    }

    async function loadAssets() {
      state.loading = true;
      state.error = '';
      render();

      try {
        var url = '/api/cms/media/assets' + (state.kind ? '?kind=' + encodeURIComponent(state.kind) : '');
        var payload = await cmsGetJson(url);
        state.assets = Array.isArray(payload.assets) ? payload.assets : [];
        state.selectedId = state.assets[0] ? state.assets[0].id : '';
      } catch (error) {
        state.error = error && error.message ? error.message : String(error);
      } finally {
        state.loading = false;
        render();
      }
    }

    function hide() {
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      overlay = null;
    }

    async function copySelected() {
      var asset = selectedAsset();
      if (!asset) return;

      var url = getAssetCopyUrl(asset);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        window.prompt('Copy media URL', url);
      }
    }

    function downloadSelected() {
      var asset = selectedAsset();
      var url = asset && (getAssetPreviewUrl(asset) || getAssetPublicUrl(asset));
      if (!asset || !url) return;

      var link = document.createElement('a');
      link.href = url;
      link.download = asset.name || '';
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    function insertSelected() {
      var asset = selectedAsset();
      if (!asset) return;

      if (onSelect) {
        onSelect(asset);
      } else if (handleInsert) {
        handleInsert(getAssetInsertUrl(asset));
      }

      hide();
    }

    async function uploadLibraryFiles(files) {
      var mediaFiles = fileListToArray(files).filter(function (file) {
        var kind = getMediaKind(file);
        return kind !== 'file' && (!state.kind || kind === state.kind);
      });
      if (!mediaFiles.length) return;

      state.uploading = true;
      state.uploadProgress = 0;
      render();

      try {
        for (var index = 0; index < mediaFiles.length; index += 1) {
          var asset = await uploadFileToAsset(mediaFiles[index], function (progress) {
            state.uploadProgress = progress;
            render();
          });
          state.assets.unshift(Object.assign({}, asset, {
            id: 's3:' + asset.key,
            path: asset.key,
            source: 'Uploaded this session',
          }));
          state.selectedId = 's3:' + asset.key;
        }
      } catch (error) {
        state.error = error && error.message ? error.message : String(error);
      } finally {
        state.uploading = false;
        state.uploadProgress = 0;
        render();
      }
    }

    overlay = document.createElement('div');
    overlay.className = 'blog-cms-media-library';
    document.body.appendChild(overlay);
    render();
    loadAssets();

    overlay.addEventListener('click', function (event) {
      var actionTarget = event.target.closest && event.target.closest('[data-action]');
      var assetTarget = event.target.closest && event.target.closest('[data-asset-id]');

      if (event.target === overlay || (actionTarget && actionTarget.dataset.action === 'close')) {
        hide();
        return;
      }
      if (assetTarget) {
        state.selectedId = assetTarget.dataset.assetId;
        render();
        return;
      }
      if (!actionTarget) return;

      if (actionTarget.dataset.action === 'copy') copySelected();
      if (actionTarget.dataset.action === 'download') downloadSelected();
      if (actionTarget.dataset.action === 'insert') insertSelected();
      if (actionTarget.dataset.action === 'upload') fileInput.click();
    });

    overlay.addEventListener('input', function (event) {
      if (event.target.classList.contains('blog-cms-media-search')) {
        state.query = event.target.value;
        render();
      }
    });

    overlay.addEventListener('change', function (event) {
      if (event.target.classList.contains('blog-cms-media-file')) {
        uploadLibraryFiles(event.target.files).finally(function () {
          event.target.value = '';
        });
      }
    });

    return hide;
  }

  function registerPostMediaLibrary() {
    if (!CMS.registerMediaLibrary) return;

    CMS.registerMediaLibrary({
      name: 'blog-media-assets',
      init: async function (options) {
        var handleInsert = options && options.handleInsert;
        var hideDialog = null;

        return {
          show: function (showOptions) {
            if (hideDialog) hideDialog();
            hideDialog = openMediaAssetsDialog({
              handleInsert: handleInsert,
              imagesOnly: !!(showOptions && showOptions.imagesOnly),
              insertMode: !!(showOptions && showOptions.id),
            });
          },
          hide: function () {
            if (hideDialog) hideDialog();
            hideDialog = null;
          },
          enableStandalone: function () {
            return true;
          },
        };
      },
    });
  }

  CMS.registerWidget('s3-image', makeMediaControl('image'), MediaPreview);
  CMS.registerWidget('s3-video', makeMediaControl('video'), MediaPreview);
  registerPostMediaLibrary();
  injectAdminMediaStyles();
  registerRawMarkdownUploadHandlers();

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
      var url = getAssetPreviewUrl(asset);
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
      var url = getAssetPreviewUrl(asset);
      return url
        ? '<video src="' + escapeAttr(url) + '" controls style="max-width:100%;"></video>'
        : '<code>' + escapeHtml(asset.key || '') + '</code>';
    },
  });
})();
