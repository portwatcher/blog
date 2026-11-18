// Just enough WebGL2 to draw instanced boxes with two textures. Written for
// this scene alone, so the whole renderer is a few kilobytes to download and
// has two small shaders to compile.
const compile = (gl: WebGL2RenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type)
  if (!shader) {
    throw new Error('Shader could not be created')
  }
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  return shader
}

export const createProgram = (
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
) => {
  const program = gl.createProgram()
  if (!program) {
    throw new Error('Program could not be created')
  }
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource)
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource)
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  // Checking the link alone avoids a synchronous wait per shader.
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) || gl.getShaderInfoLog(vertex)
      || gl.getShaderInfoLog(fragment)
    throw new Error(`Program failed to link: ${log}`)
  }
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)
  const locations = new Map<string, WebGLUniformLocation | null>()
  return {
    program,
    uniform(name: string) {
      let location = locations.get(name)
      if (location === undefined) {
        location = gl.getUniformLocation(program, name)
        locations.set(name, location)
      }
      return location
    },
    destroy() {
      gl.deleteProgram(program)
    },
  }
}

export type ArchiveProgram = ReturnType<typeof createProgram>

// Artwork is black ink on white paper, so one byte per pixel is all a texture
// has to hold: a quarter of the memory and upload of an RGBA canvas.
export const createInkTexture = (gl: WebGL2RenderingContext, anisotropy: number) => {
  const texture = gl.createTexture()
  if (!texture) {
    throw new Error('Texture could not be created')
  }
  const filter = gl.getExtension('EXT_texture_filter_anisotropic')
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  if (filter && anisotropy > 1) {
    gl.texParameterf(gl.TEXTURE_2D, filter.TEXTURE_MAX_ANISOTROPY_EXT, anisotropy)
  }
  // Until artwork arrives the texture is a single blank pixel of paper.
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([255]))

  return {
    texture,
    upload(source: TexImageSource) {
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, source)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
      gl.generateMipmap(gl.TEXTURE_2D)
    },
    destroy() {
      gl.deleteTexture(texture)
    },
  }
}

export type ArchiveInkTexture = ReturnType<typeof createInkTexture>

// A unit box whose faces each carry their own 0..1 coordinates and an id, so
// one shader can treat spine, cover and page edges differently.
//   0 front cover (+z)   1 back cover (-z)   2 spine (-x)
//   3 fore-edge (+x)     4 top (+y)          5 bottom (-y)
const boxFaces = [
  { normal: [0, 0, 1], origin: [-0.5, -0.5, 0.5], u: [1, 0, 0], v: [0, 1, 0] },
  { normal: [0, 0, -1], origin: [0.5, -0.5, -0.5], u: [-1, 0, 0], v: [0, 1, 0] },
  { normal: [-1, 0, 0], origin: [-0.5, -0.5, -0.5], u: [0, 0, 1], v: [0, 1, 0] },
  { normal: [1, 0, 0], origin: [0.5, -0.5, 0.5], u: [0, 0, -1], v: [0, 1, 0] },
  { normal: [0, 1, 0], origin: [-0.5, 0.5, 0.5], u: [1, 0, 0], v: [0, 0, -1] },
  { normal: [0, -1, 0], origin: [-0.5, -0.5, -0.5], u: [1, 0, 0], v: [0, 0, 1] },
] as const

export const archiveInstanceFloats = 28
const vertexFloats = 9

export const createBoxGeometry = (gl: WebGL2RenderingContext) => {
  const vertices: number[] = []
  const indices: number[] = []
  boxFaces.forEach((face, faceIndex) => {
    const corners = [[0, 0], [1, 0], [1, 1], [0, 1]]
    for (const [u, v] of corners) {
      vertices.push(
        face.origin[0] + face.u[0] * u + face.v[0] * v,
        face.origin[1] + face.u[1] * u + face.v[1] * v,
        face.origin[2] + face.u[2] * u + face.v[2] * v,
        u, v, faceIndex, ...face.normal,
      )
    }
    const first = faceIndex * 4
    indices.push(first, first + 1, first + 2, first, first + 2, first + 3)
  })
  const vertexBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW)
  const indexBuffer = gl.createBuffer()
  gl.bindVertexArray(null)
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer)
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW)
  const stride = vertexFloats * 4
  const instanceStride = archiveInstanceFloats * 4

  return {
    indexCount: indices.length,
    // Builds a vertex array pairing the shared box with one buffer of
    // per-book data: a model matrix, two texture rectangles and a style.
    createVertexArray(instanceBuffer: WebGLBuffer) {
      const vertexArray = gl.createVertexArray()
      gl.bindVertexArray(vertexArray)
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer)
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
      const layout = [[0, 3, 0], [1, 2, 3], [2, 1, 5], [3, 3, 6]]
      for (const [location, size, offset] of layout) {
        gl.enableVertexAttribArray(location)
        gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset * 4)
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer)
      for (let column = 0; column < 7; column++) {
        const location = 4 + column
        gl.enableVertexAttribArray(location)
        gl.vertexAttribPointer(location, 4, gl.FLOAT, false, instanceStride, column * 16)
        gl.vertexAttribDivisor(location, 1)
      }
      gl.bindVertexArray(null)
      return vertexArray
    },
    destroy() {
      gl.deleteBuffer(vertexBuffer)
      gl.deleteBuffer(indexBuffer)
    },
  }
}

export type ArchiveBoxGeometry = ReturnType<typeof createBoxGeometry>
