// The handful of vector, quaternion and matrix operations the archive scene
// needs. Matrices are column-major Float32Arrays, ready to hand to WebGL.
export type Vec3 = [number, number, number]
export type Quat = [number, number, number, number]
export type Mat4 = Float32Array

export const createMat4 = (): Mat4 => {
  const matrix = new Float32Array(16)
  matrix[0] = matrix[5] = matrix[10] = matrix[15] = 1
  return matrix
}

export const setVec3 = (out: Vec3, x: number, y: number, z: number) => {
  out[0] = x
  out[1] = y
  out[2] = z
  return out
}

export const lerpVec3 = (out: Vec3, from: Vec3, to: Vec3, progress: number) => {
  out[0] = from[0] + (to[0] - from[0]) * progress
  out[1] = from[1] + (to[1] - from[1]) * progress
  out[2] = from[2] + (to[2] - from[2]) * progress
  return out
}

export const quatFromEuler = (
  out: Quat,
  x: number,
  y: number,
  z: number,
  order: 'XYZ' | 'ZYX',
) => {
  const c1 = Math.cos(x / 2)
  const c2 = Math.cos(y / 2)
  const c3 = Math.cos(z / 2)
  const s1 = Math.sin(x / 2)
  const s2 = Math.sin(y / 2)
  const s3 = Math.sin(z / 2)
  const sign = order === 'XYZ' ? 1 : -1
  out[0] = s1 * c2 * c3 + sign * c1 * s2 * s3
  out[1] = c1 * s2 * c3 - sign * s1 * c2 * s3
  out[2] = c1 * c2 * s3 + sign * s1 * s2 * c3
  out[3] = c1 * c2 * c3 - sign * s1 * s2 * s3
  return out
}

export const quatSlerp = (out: Quat, from: Quat, to: Quat, progress: number) => {
  let cosine = from[0] * to[0] + from[1] * to[1] + from[2] * to[2] + from[3] * to[3]
  // Take the shorter way round.
  const direction = cosine < 0 ? -1 : 1
  cosine *= direction
  let weightFrom = 1 - progress
  let weightTo = progress
  if (cosine < 0.9995) {
    const angle = Math.acos(cosine)
    const sine = Math.sin(angle)
    weightFrom = Math.sin((1 - progress) * angle) / sine
    weightTo = Math.sin(progress * angle) / sine
  }
  weightTo *= direction
  const x = from[0] * weightFrom + to[0] * weightTo
  const y = from[1] * weightFrom + to[1] * weightTo
  const z = from[2] * weightFrom + to[2] * weightTo
  const w = from[3] * weightFrom + to[3] * weightTo
  const length = Math.hypot(x, y, z, w) || 1
  out[0] = x / length
  out[1] = y / length
  out[2] = z / length
  out[3] = w / length
  return out
}

export const quatRotate = (out: Vec3, rotation: Quat, vector: Vec3) => {
  const [qx, qy, qz, qw] = rotation
  const [x, y, z] = vector
  const tx = 2 * (qy * z - qz * y)
  const ty = 2 * (qz * x - qx * z)
  const tz = 2 * (qx * y - qy * x)
  out[0] = x + qw * tx + qy * tz - qz * ty
  out[1] = y + qw * ty + qz * tx - qx * tz
  out[2] = z + qw * tz + qx * ty - qy * tx
  return out
}

// The orientation whose +Z axis points from `from` towards `to`, upright.
export const quatFacing = (out: Quat, from: Vec3, to: Vec3) => {
  let zx = to[0] - from[0]
  let zy = to[1] - from[1]
  let zz = to[2] - from[2]
  const zLength = Math.hypot(zx, zy, zz) || 1
  zx /= zLength
  zy /= zLength
  zz /= zLength
  // x = up × z, with up = +Y.
  let xx = zz
  let xz = -zx
  const xLength = Math.hypot(xx, xz) || 1
  xx /= xLength
  xz /= xLength
  // y = z × x
  const yx = zy * xz
  const yy = zz * xx - zx * xz
  const yz = -zy * xx
  const trace = xx + yy + zz
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1)
    out[3] = 0.25 / s
    out[0] = (yz - zy) * s
    out[1] = (zx - xz) * s
    out[2] = (0 - yx) * s
  } else if (xx > yy && xx > zz) {
    const s = 2 * Math.sqrt(1 + xx - yy - zz)
    out[3] = (yz - zy) / s
    out[0] = 0.25 * s
    out[1] = (yx + 0) / s
    out[2] = (zx + xz) / s
  } else if (yy > zz) {
    const s = 2 * Math.sqrt(1 + yy - xx - zz)
    out[3] = (zx - xz) / s
    out[0] = (yx + 0) / s
    out[1] = 0.25 * s
    out[2] = (zy + yz) / s
  } else {
    const s = 2 * Math.sqrt(1 + zz - xx - yy)
    out[3] = (0 - yx) / s
    out[0] = (zx + xz) / s
    out[1] = (zy + yz) / s
    out[2] = 0.25 * s
  }
  return out
}

export const mat4Compose = (out: Mat4, position: Vec3, rotation: Quat, scale: Vec3) => {
  const [x, y, z, w] = rotation
  const x2 = x + x
  const y2 = y + y
  const z2 = z + z
  const xx = x * x2
  const xy = x * y2
  const xz = x * z2
  const yy = y * y2
  const yz = y * z2
  const zz = z * z2
  const wx = w * x2
  const wy = w * y2
  const wz = w * z2
  out[0] = (1 - (yy + zz)) * scale[0]
  out[1] = (xy + wz) * scale[0]
  out[2] = (xz - wy) * scale[0]
  out[3] = 0
  out[4] = (xy - wz) * scale[1]
  out[5] = (1 - (xx + zz)) * scale[1]
  out[6] = (yz + wx) * scale[1]
  out[7] = 0
  out[8] = (xz + wy) * scale[2]
  out[9] = (yz - wx) * scale[2]
  out[10] = (1 - (xx + yy)) * scale[2]
  out[11] = 0
  out[12] = position[0]
  out[13] = position[1]
  out[14] = position[2]
  out[15] = 1
  return out
}

export const mat4Multiply = (out: Mat4, a: Mat4, b: Mat4) => {
  for (let column = 0; column < 4; column++) {
    const b0 = b[column * 4]
    const b1 = b[column * 4 + 1]
    const b2 = b[column * 4 + 2]
    const b3 = b[column * 4 + 3]
    scratch[column * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3
    scratch[column * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3
    scratch[column * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3
    scratch[column * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3
  }
  out.set(scratch)
  return out
}

const scratch = new Float32Array(16)

// Returns false, leaving `out` untouched, for a matrix with no inverse (a
// book scaled away to nothing, for instance).
export const mat4Invert = (out: Mat4, m: Mat4) => {
  const b00 = m[0] * m[5] - m[1] * m[4]
  const b01 = m[0] * m[6] - m[2] * m[4]
  const b02 = m[0] * m[7] - m[3] * m[4]
  const b03 = m[1] * m[6] - m[2] * m[5]
  const b04 = m[1] * m[7] - m[3] * m[5]
  const b05 = m[2] * m[7] - m[3] * m[6]
  const b06 = m[8] * m[13] - m[9] * m[12]
  const b07 = m[8] * m[14] - m[10] * m[12]
  const b08 = m[8] * m[15] - m[11] * m[12]
  const b09 = m[9] * m[14] - m[10] * m[13]
  const b10 = m[9] * m[15] - m[11] * m[13]
  const b11 = m[10] * m[15] - m[11] * m[14]
  const determinant = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06
  if (Math.abs(determinant) < 1e-12) {
    return false
  }
  const inverse = 1 / determinant
  scratch[0] = (m[5] * b11 - m[6] * b10 + m[7] * b09) * inverse
  scratch[1] = (m[2] * b10 - m[1] * b11 - m[3] * b09) * inverse
  scratch[2] = (m[13] * b05 - m[14] * b04 + m[15] * b03) * inverse
  scratch[3] = (m[10] * b04 - m[9] * b05 - m[11] * b03) * inverse
  scratch[4] = (m[6] * b08 - m[4] * b11 - m[7] * b07) * inverse
  scratch[5] = (m[0] * b11 - m[2] * b08 + m[3] * b07) * inverse
  scratch[6] = (m[14] * b02 - m[12] * b05 - m[15] * b01) * inverse
  scratch[7] = (m[8] * b05 - m[10] * b02 + m[11] * b01) * inverse
  scratch[8] = (m[4] * b10 - m[5] * b08 + m[7] * b06) * inverse
  scratch[9] = (m[1] * b08 - m[0] * b10 - m[3] * b06) * inverse
  scratch[10] = (m[12] * b04 - m[13] * b02 + m[15] * b00) * inverse
  scratch[11] = (m[9] * b02 - m[8] * b04 - m[11] * b00) * inverse
  scratch[12] = (m[5] * b07 - m[4] * b09 - m[6] * b06) * inverse
  scratch[13] = (m[0] * b09 - m[1] * b07 + m[2] * b06) * inverse
  scratch[14] = (m[13] * b01 - m[12] * b03 - m[14] * b00) * inverse
  scratch[15] = (m[8] * b03 - m[9] * b01 + m[10] * b00) * inverse
  out.set(scratch)
  return true
}

export const mat4Perspective = (
  out: Mat4,
  fieldOfView: number,
  aspect: number,
  near: number,
  far: number,
) => {
  const scale = 1 / Math.tan(fieldOfView / 2)
  out.fill(0)
  out[0] = scale / aspect
  out[5] = scale
  out[10] = (far + near) / (near - far)
  out[11] = -1
  out[14] = 2 * far * near / (near - far)
  return out
}

// The view matrix of an upright camera at `eye` looking at `target`.
export const mat4LookAt = (out: Mat4, eye: Vec3, target: Vec3) => {
  let zx = eye[0] - target[0]
  let zy = eye[1] - target[1]
  let zz = eye[2] - target[2]
  const zLength = Math.hypot(zx, zy, zz) || 1
  zx /= zLength
  zy /= zLength
  zz /= zLength
  let xx = zz
  let xz = -zx
  const xLength = Math.hypot(xx, xz) || 1
  xx /= xLength
  xz /= xLength
  const yx = zy * xz
  const yy = zz * xx - zx * xz
  const yz = -zy * xx
  out[0] = xx
  out[1] = yx
  out[2] = zx
  out[3] = 0
  out[4] = 0
  out[5] = yy
  out[6] = zy
  out[7] = 0
  out[8] = xz
  out[9] = yz
  out[10] = zz
  out[11] = 0
  out[12] = -(xx * eye[0] + xz * eye[2])
  out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2])
  out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2])
  out[15] = 1
  return out
}

// Applies `m` to a point, including the perspective divide.
export const transformPoint = (out: Vec3, m: Mat4, point: Vec3) => {
  const [x, y, z] = point
  const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1
  out[0] = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w
  out[1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w
  out[2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w
  return out
}

// Applies only the rotation and scale of `m`: for directions, not points.
export const transformDirection = (out: Vec3, m: Mat4, direction: Vec3) => {
  const [x, y, z] = direction
  out[0] = m[0] * x + m[4] * y + m[8] * z
  out[1] = m[1] * x + m[5] * y + m[9] * z
  out[2] = m[2] * x + m[6] * y + m[10] * z
  return out
}
