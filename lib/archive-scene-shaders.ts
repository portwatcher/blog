// Black-and-white print: every pixel is paper or ink. Form comes from an ink
// outline, ruled tone on the faces turned away from the light and hatching on
// the page edges. Depth comes from the row fading into the paper behind
// whatever is in front, and from heavier lines on what is nearer.
export const bookVertexShader = `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec2 aUv;
layout(location = 2) in float aFace;
layout(location = 3) in vec3 aNormal;
layout(location = 4) in mat4 aModel;
layout(location = 8) in vec4 aSpineRect;
layout(location = 9) in vec4 aCoverRect;
layout(location = 10) in vec4 aStyle;
uniform mat4 uViewProjection;
uniform vec3 uSize;
uniform vec3 uLight;
out vec2 vUv;
out vec2 vFaceSize;
out float vDepth;
flat out float vFace;
flat out float vLight;
flat out vec4 vSpineRect;
flat out vec4 vCoverRect;
flat out vec4 vStyle;

void main() {
  gl_Position = uViewProjection * (aModel * vec4(aPosition * uSize, 1.0));
  vec3 size = uSize * vec3(length(aModel[0].xyz), length(aModel[1].xyz), length(aModel[2].xyz));
  vFaceSize = aFace < 1.5 ? size.xy : aFace < 3.5 ? size.zy : size.xz;
  vUv = aUv;
  vDepth = gl_Position.w;
  vFace = aFace;
  vLight = dot(normalize(mat3(aModel) * aNormal), uLight);
  vSpineRect = aSpineRect;
  vCoverRect = aCoverRect;
  vStyle = aStyle;
}
`

export const bookFragmentShader = `#version 300 es
precision highp float;
uniform sampler2D uSpine;
uniform sampler2D uCover;
uniform vec3 uPaper;
uniform vec3 uInk;
uniform vec3 uBackground;
// x: where the haze begins, y: 1 / its depth, z: reference depth for lines.
uniform vec3 uHaze;
uniform float uLine;
uniform int uKind;
in vec2 vUv;
in vec2 vFaceSize;
in float vDepth;
flat in float vFace;
flat in float vLight;
flat in vec4 vSpineRect;
flat in vec4 vCoverRect;
flat in vec4 vStyle;
out vec4 outColor;

// An ink line around a face, the same width on screen at any angle.
float outline(float width) {
  vec2 pixels = min(vUv, 1.0 - vUv) / max(fwidth(vUv), vec2(1e-6));
  return 1.0 - smoothstep(width - 0.75, width + 0.75, min(pixels.x, pixels.y));
}

// Parallel ruled lines. Too fine to draw, they settle into their even grey
// rather than shimmer.
float hatch(float coordinate, float pitch, float duty) {
  float cell = coordinate / pitch;
  float blur = fwidth(cell);
  float line = 1.0 - smoothstep(duty - blur, duty + blur, abs(fract(cell) - 0.5) * 2.0);
  return mix(line, duty, clamp(blur * 1.6 - 0.5, 0.0, 1.0));
}

// Tone for a face in shade: fine parallel rules whose weight is the depth of
// the shade. They run across the axis a turning book is foreshortened along,
// so they stay evenly spaced on screen at any angle; a grid of dots would
// crowd into moire as the face turns edge-on.
float shadeTone(float coordinate, float level) {
  return hatch(coordinate, 0.075, level) * smoothstep(0.0, 0.03, level);
}

void main() {
  vec2 point = vUv * vFaceSize;
  int face = int(vFace + 0.5);
  float ink = 0.0;
  if (uKind == 0) {
    if (face == 2) {
      ink = 1.0 - texture(uSpine, mix(vSpineRect.xy, vSpineRect.zw, vUv)).r;
    } else if (face == 0) {
      ink = vStyle.x * (1.0 - texture(uCover, mix(vCoverRect.xy, vCoverRect.zw, vUv)).r);
    } else if (face >= 3) {
      // The cut edges of the pages, ruled across the thickness of the book.
      ink = 0.6 * hatch(face == 3 ? point.x : point.y, 0.052, 0.2);
    }
    // Faces turned from the light take a sheet of tone, heavier the further
    // they turn. A cover swinging open comes out of it into the white.
    float shade = clamp((0.22 - vLight) * 1.5, 0.0, 1.0);
    ink = max(ink, shadeTone(face >= 4 ? point.x : point.y, shade * 0.42));
  } else if (uKind == 1) {
    ink = face == 0 ? 1.0 - texture(uCover, mix(vCoverRect.xy, vCoverRect.zw, vUv)).r : 0.0;
  } else {
    ink = 1.0;
  }
  // Nearer things are drawn with a heavier pen.
  float weight = uLine * clamp(uHaze.z / vDepth, 0.7, 1.7);
  ink = max(ink, outline(weight));
  float haze = clamp((vDepth - uHaze.x) * uHaze.y, 0.0, 1.0);
  outColor = vec4(mix(mix(uPaper, uInk, ink), uBackground, haze), 1.0);
}
`

// A soft bloom of paper-white behind the open cover. It bleaches the row
// around the book, the way a figure is cut out of a busy background.
export const glowVertexShader = `#version 300 es
layout(location = 0) in vec2 aCorner;
uniform mat4 uViewProjection;
uniform vec3 uCenter;
uniform vec2 uExtent;
out vec2 vCorner;

void main() {
  vCorner = aCorner;
  gl_Position = uViewProjection * vec4(uCenter + vec3(aCorner * uExtent, 0.0), 1.0);
}
`

export const glowFragmentShader = `#version 300 es
precision mediump float;
uniform vec3 uBackground;
uniform float uStrength;
in vec2 vCorner;
out vec4 outColor;

void main() {
  float alpha = uStrength * (1.0 - smoothstep(0.3, 1.0, length(vCorner)));
  outColor = vec4(uBackground * alpha, alpha);
}
`
