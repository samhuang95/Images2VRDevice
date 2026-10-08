export const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

/**
 * One pass per eye: for every screen pixel, undo the lens distortion to get the view ray,
 * rotate it by the head pose and intersect it with a flat virtual cinema screen. The video is
 * sampled directly from its own texture, so there is no intermediate render target.
 */
export const fragmentShader = /* glsl */ `
precision highp float;

uniform sampler2D uVideo;
uniform bool uHasVideo;
uniform vec2 uViewportMm;     // physical size of one eye's half of the screen
uniform vec2 uLensCenter;     // lens centre inside the viewport (0..1)
uniform float uScreenToLens;  // mm
uniform vec2 uK;              // lens distortion k1, k2
uniform mat3 uHeadRot;        // world-from-head rotation
uniform vec3 uEyeOffset;      // eye position in head space, metres
uniform vec2 uScreenSize;     // virtual screen size, metres
uniform float uScreenDist;    // metres, screen sits at z = -uScreenDist
uniform vec4 uUvRect;         // this eye's region of the video frame
uniform vec2 uTexel;          // half texel, keeps sampling inside the eye's region
uniform vec3 uEyeTint;
varying vec2 vUv;

vec3 testPattern(vec2 suv) {
  vec2 cells = vec2(16.0, 9.0);
  vec2 g = suv * cells;
  vec2 w = fwidth(g) * 1.2;
  vec2 d = abs(fract(g - 0.5) - 0.5);
  float line = 1.0 - smoothstep(0.0, 1.0, min(d.x / w.x, d.y / w.y));
  vec2 c = abs(suv - 0.5) * vec2(cells.x, cells.y);
  float axis = 1.0 - smoothstep(0.0, 1.0, min(c.x / w.x, c.y / w.y));
  vec2 p = (suv - 0.5) * vec2(cells.x, cells.y);
  float ring = 1.0 - smoothstep(0.0, 1.0, abs(length(p) - 4.0) / max(w.x, w.y));
  vec3 col = vec3(0.07);
  col = mix(col, vec3(0.45), line);
  col = mix(col, vec3(1.0), max(axis, ring));
  // eye marker in the top-left corner of the screen: red = left eye, blue = right eye
  if (suv.x < 0.08 && suv.y > 0.86) col = uEyeTint;
  return col;
}

void main() {
  vec2 rs = (vUv - uLensCenter) * uViewportMm / uScreenToLens;
  float r2 = dot(rs, rs);
  vec2 rp = rs * (1.0 + uK.x * r2 + uK.y * r2 * r2);
  vec3 dir = uHeadRot * normalize(vec3(rp, -1.0));
  vec3 origin = uHeadRot * uEyeOffset;

  vec3 color = vec3(0.0);
  if (dir.z < -1e-4) {
    float t = (-uScreenDist - origin.z) / dir.z;
    if (t > 0.0) {
      vec2 suv = (origin.xy + t * dir.xy) / uScreenSize + 0.5;
      if (all(greaterThanEqual(suv, vec2(0.0))) && all(lessThanEqual(suv, vec2(1.0)))) {
        if (uHasVideo) {
          vec2 uv = uUvRect.xy + suv * uUvRect.zw;
          uv = clamp(uv, uUvRect.xy + uTexel, uUvRect.xy + uUvRect.zw - uTexel);
          color = texture2D(uVideo, uv).rgb;
        } else {
          color = testPattern(suv);
        }
      }
    }
  }
  gl_FragColor = vec4(color, 1.0);
}
`
