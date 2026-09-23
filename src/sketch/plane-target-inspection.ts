import { planeCorners } from "./plane-bounds.js";
import { type PlaneId, planes } from "./planes.js";
import type { World } from "./world.js";

/** Read-only presentation data for capture/inspection, formerly on plane labels. */
export function inspectPlaneTargets(world: World) {
  return world.scene.children
    .filter((object) => object.userData.planeTarget)
    .map((object) => {
      const id = object.userData.planeTarget as PlaneId;
      return {
        id,
        visible: object.visible,
        hovered: !!object.userData.hovered,
        bounds: world.planeBounds(planes[id]),
        points: planeCorners(planes[id], world.planeBounds(planes[id])).map((p) =>
          world.project(p),
        ),
      };
    });
}
