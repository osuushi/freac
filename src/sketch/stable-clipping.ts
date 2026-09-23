import * as THREE from "three";

/** Interpolate a small signed distance, not camera-space coordinates that cancel
 * in the fragment shader. Skinny coplanar triangles amplify that cancellation. */
export function stableClipping<T extends THREE.Material>(material: T): T {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <clipping_planes_pars_vertex>",
        `
#if NUM_CLIPPING_PLANES > 0
uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
varying float vClipDistance[ NUM_CLIPPING_PLANES ];
#endif`,
      )
      .replace(
        "#include <clipping_planes_vertex>",
        `
#if NUM_CLIPPING_PLANES > 0
#pragma unroll_loop_start
for ( int i = 0; i < NUM_CLIPPING_PLANES; i ++ ) {
  vClipDistance[ i ] = dot( -mvPosition.xyz, clippingPlanes[ i ].xyz ) - clippingPlanes[ i ].w;
}
#pragma unroll_loop_end
#endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <clipping_planes_pars_fragment>",
        THREE.ShaderChunk.clipping_planes_pars_fragment.replace(
          "varying vec3 vClipPosition;",
          "varying float vClipDistance[ NUM_CLIPPING_PLANES ];",
        ),
      )
      .replace(
        "#include <clipping_planes_fragment>",
        THREE.ShaderChunk.clipping_planes_fragment
          .replaceAll("- dot( vClipPosition, plane.xyz ) + plane.w", "-vClipDistance[ i ]")
          .replaceAll("dot( vClipPosition, plane.xyz ) > plane.w", "vClipDistance[ i ] > 0.0"),
      );
  };
  material.customProgramCacheKey = () => "stable-clip-distance";
  return material;
}
