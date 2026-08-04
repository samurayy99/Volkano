const EPSILON = 1e-8;

const subtract = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const length = (value) => Math.hypot(value[0], value[1], value[2]);
const normalize = (value) => {
  const magnitude = length(value);
  if (!Number.isFinite(magnitude) || magnitude <= EPSILON) {
    throw new Error("Formation shard contains a degenerate face.");
  }
  return value.map((component) => component / magnitude);
};

/**
 * One deterministic hard-faceted formation primitive. Faces duplicate their
 * vertices deliberately: a shard has six stable flat normals and no indexed
 * smoothing or runtime topology repair.
 */
export function buildFormationShardGeometryData() {
  const bottom = [
    [-0.41, -0.26, -0.59],
    [0.41, -0.26, -0.59],
    [0.41, -0.26, 0.59],
    [-0.41, -0.26, 0.59],
  ];
  const top = [
    [-0.31, 0.26, -0.5],
    [0.37, 0.26, -0.5],
    [0.37, 0.26, 0.47],
    [-0.31, 0.26, 0.47],
  ];
  const center = [0.015, 0, -0.0075];
  const faces = [
    [bottom[1], bottom[2], bottom[3], bottom[0]],
    [top[3], top[2], top[1], top[0]],
    [top[0], top[1], bottom[1], bottom[0]],
    [top[1], top[2], bottom[2], bottom[1]],
    [top[2], top[3], bottom[3], bottom[2]],
    [top[3], top[0], bottom[0], bottom[3]],
  ];

  const positions = new Float32Array(24 * 3);
  const normals = new Float32Array(24 * 3);
  const uvs = new Float32Array(24 * 2);
  const indices = new Uint16Array(12 * 3);
  const triangleAreas = new Float32Array(12);
  let vertexOffset = 0;
  let triangleOffset = 0;

  for (const face of faces) {
    const edgeA = subtract(face[1], face[0]);
    const edgeB = subtract(face[2], face[0]);
    const normal = normalize(cross(edgeA, edgeB));
    const centroid = face.reduce(
      (sum, point) => [sum[0] + point[0] / 4, sum[1] + point[1] / 4, sum[2] + point[2] / 4],
      [0, 0, 0],
    );
    if (dot(normal, subtract(centroid, center)) <= 0) {
      throw new Error("Formation shard face winding is not outward.");
    }

    const faceUvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (let faceVertexIndex = 0; faceVertexIndex < face.length; faceVertexIndex++) {
      const vertex = face[faceVertexIndex];
      positions.set(vertex, vertexOffset * 3);
      normals.set(normal, vertexOffset * 3);
      uvs.set(faceUvs[faceVertexIndex], vertexOffset * 2);
      vertexOffset += 1;
    }

    const faceVertex = vertexOffset - 4;
    indices.set(
      [faceVertex, faceVertex + 1, faceVertex + 2, faceVertex, faceVertex + 2, faceVertex + 3],
      triangleOffset * 3,
    );
    const triangles = [[face[0], face[1], face[2]], [face[0], face[2], face[3]]];
    for (const triangle of triangles) {
      const area = length(cross(
        subtract(triangle[1], triangle[0]),
        subtract(triangle[2], triangle[0]),
      )) * 0.5;
      if (!Number.isFinite(area) || area <= EPSILON) {
        throw new Error("Formation shard contains a degenerate triangle.");
      }
      triangleAreas[triangleOffset] = area;
      triangleOffset += 1;
    }
  }

  for (const value of positions) {
    if (!Number.isFinite(value)) throw new Error("Formation shard position is not finite.");
  }
  for (const value of normals) {
    if (!Number.isFinite(value)) throw new Error("Formation shard normal is not finite.");
  }
  for (const value of uvs) {
    if (!Number.isFinite(value)) throw new Error("Formation shard UV is not finite.");
  }

  return { positions, normals, uvs, indices, triangleAreas };
}
