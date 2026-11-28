import * as T from '/vendor/three.module.js';
import { bounds, cover, shutter, shutterMaxHP, teams } from './yard.js';
import { yardRoutes } from './yard-layout.js';

const ink = 0x161a1b;
const cream = '#f2dcac';
const sodium = '#ef954c';
const verdigris = '#79d6d0';
const volt = '#d7ee86';
const cube = new T.BoxGeometry(1, 1, 1);
const inkSurface = new T.MeshBasicMaterial({ color: ink, side: T.BackSide });
const placardSurfaces = new Map();
const tones = new T.DataTexture(new Uint8Array([26, 92, 157, 218, 255]), 5, 1, T.RedFormat);
tones.minFilter = tones.magFilter = T.NearestFilter;
tones.needsUpdate = true;

function randomFrom(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function canvasTexture(width, height, draw, anisotropy = 2) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

function printedMetal() {
  return canvasTexture(256, 256, (ctx, width, height) => {
    ctx.fillStyle = '#e6ddc4';
    ctx.fillRect(0, 0, width, height);
    const random = randomFrom(533);
    for (let y = 4; y < height; y += 6) {
      for (let x = 4; x < width; x += 7) {
        ctx.fillStyle = (y < 34 || y > height - 47) ? '#63584660' : '#7c665230';
        ctx.fillRect(x + (y % 2) * 3, y, (y > height - 46 ? 1.8 : 0.9) + random() * .4, 1.5);
      }
    }
    for (let i = 0; i < 160; i++) {
      const x = random() * width;
      const y = random() * height;
      ctx.fillStyle = i % 2 ? '#6759432e' : '#fff6d251';
      ctx.fillRect(x, y, 1 + random() * 15, .5 + random() * 1.1);
    }
    ctx.fillStyle = '#413d3349';
    ctx.fillRect(0, height - 5, width, 5);
  });
}

function groundTile() {
  return canvasTexture(512, 512, (ctx, width, height) => {
    ctx.fillStyle = '#786d60';
    ctx.fillRect(0, 0, width, height);
    const random = randomFrom(2593);
    for (let y = 0; y < height; y += 3) {
      for (let x = 0; x < width; x += 4) {
        ctx.fillStyle = random() < .67 ? '#171b1e23' : '#f5d6a221';
        ctx.fillRect(x, y, random() * 2.2 + .4, 1.4);
      }
    }
    ctx.fillStyle = '#322e2d9e';
    ctx.fillRect(0, 0, width, 5);
    ctx.fillRect(0, 0, 5, height);
    ctx.fillStyle = '#bc9d776b';
    ctx.fillRect(5, 5, width - 5, 3);
    ctx.fillRect(5, 5, 3, height - 5);
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      let x = random() * width;
      let y = random() * height;
      ctx.moveTo(x, y);
      for (let j = 0; j < 8; j++) {
        x += (random() - .5) * 58;
        y += (random() - .5) * 47;
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = i % 2 ? '#30272591' : '#3f352f64';
      ctx.lineWidth = 1 + random();
      ctx.stroke();
    }
  });
}

function track(ctx, path) {
  ctx.beginPath();
  ctx.moveTo(...path[0]);
  for (const stop of path.slice(1)) ctx.lineTo(...stop);
  ctx.stroke();
}

function routeArrow(ctx, x, z, heading, color, size = 1) {
  ctx.save();
  ctx.translate(x, z);
  ctx.rotate(heading);
  ctx.scale(size, size);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -.5);
  ctx.lineTo(.27, -.12);
  ctx.lineTo(.11, -.12);
  ctx.lineTo(.11, .29);
  ctx.lineTo(-.11, .29);
  ctx.lineTo(-.11, -.12);
  ctx.lineTo(-.27, -.12);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function markWalkingRoute(ctx, path, color, dashes) {
  ctx.lineWidth = .24;
  ctx.strokeStyle = '#272a2ba1';
  track(ctx, path);
  ctx.lineWidth = .115;
  ctx.strokeStyle = color;
  ctx.setLineDash(dashes);
  track(ctx, path);
  ctx.setLineDash([]);
  for (let index = 1; index < path.length - 1; index++) {
    const [x, z] = path[index];
    const [nextX, nextZ] = path[index + (z > 0 ? 1 : -1)];
    routeArrow(ctx, x, z, Math.atan2(nextX - x, z - nextZ), color, .75);
  }
}

function printGroundShadows(ctx) {
  ctx.beginPath();
  for (const { x, z, w, d, h } of cover) {
    const left = x - w / 2;
    const right = x + w / 2;
    const top = z - d / 2;
    const bottom = z + d / 2;
    // The yard light is fixed. Its floor silhouettes can share the ground texture.
    const dx = h * 11 / 15;
    const dz = h * 10 / 15;
    ctx.moveTo(left, top);
    ctx.lineTo(right, top);
    ctx.lineTo(right + dx, top + dz);
    ctx.lineTo(right + dx, bottom + dz);
    ctx.lineTo(left + dx, bottom + dz);
    ctx.lineTo(left, bottom);
    ctx.closePath();
  }
  ctx.fillStyle = '#1420264b';
  ctx.fill();

  // Bake the fixed steelwork; the moving load gets its own small contact shadow.
  ctx.strokeStyle = '#19232843';
  ctx.lineWidth = .21;
  for (const x of [3.25, 4.36]) track(ctx, [[x, -bounds.z], [x, bounds.z]]);
  for (const z of [-19, 3.5, 20]) {
    for (const edge of [-.42, .42]) track(ctx, [[-bounds.x, z + edge], [bounds.x, z + edge]]);
    ctx.lineWidth = .115;
    for (let x = -bounds.x; x < bounds.x; x += 2) track(ctx, [[x, z - .42], [x + 1, z + .42], [x + 2, z - .42]]);
    ctx.lineWidth = .21;
  }
}

function floorPlan(tile = groundTile().image) {
  return canvasTexture(1536, 2048, (ctx, width, height) => {
    const yardWidth = bounds.x * 2 + .28;
    const yardLength = bounds.z * 2 + .28;
    const pattern = ctx.createPattern(tile, 'repeat');
    pattern.setTransform(new DOMMatrix().scale(width / (tile.width * 7.4), height / (tile.height * 9.2)));
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, width, height);
    ctx.translate(width / 2, height / 2);
    ctx.scale(width / yardWidth, height / yardLength);
    ctx.lineJoin = 'round';

    for (const side of [-1, 1]) {
      const x = side * 2.50;
      ctx.fillStyle = '#292f2f9b';
      for (let z = -bounds.z + .6; z < bounds.z; z += .84) ctx.fillRect(x - .35, z, .70, .105);
      for (const edge of [-1, 1]) {
        ctx.fillRect(x + edge * .24 - .032, -bounds.z, .066, bounds.z * 2);
        ctx.fillStyle = '#989e8a8c';
        ctx.fillRect(x + edge * .24 - .004, -bounds.z, .027, bounds.z * 2);
        ctx.fillStyle = '#292f2f9b';
      }
    }

    markWalkingRoute(ctx, yardRoutes.flank, '#8db5ae', [.53, .25]);
    markWalkingRoute(ctx, yardRoutes.shortcut, '#db8e58', [.18, .23]);
    ctx.strokeStyle = '#c4c68a9d';
    ctx.lineWidth = .07;
    ctx.setLineDash([1.1, .26]);
    for (const side of [-1, 1]) track(ctx, yardRoutes.battery.map(([, z]) => [side * .92, z]));
    ctx.setLineDash([]);
    for (const side of [-1, 1]) {
      for (const distance of [3.8, 6.4, 8.8, 12.8, 17.6]) routeArrow(ctx, 0, side * distance, side === 1 ? 0 : Math.PI, '#d0cf91', 1.15);
    }

    ctx.beginPath();
    ctx.arc(0, 0, 1.28, 0, Math.PI * 2);
    ctx.fillStyle = '#282f26b0';
    ctx.fill();
    ctx.lineWidth = .075;
    ctx.strokeStyle = volt;
    ctx.setLineDash([.58, .18]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#c4c68a88';
    for (const side of [-1, 1]) {
      ctx.fillRect(side * 1.48 - .04, -.38, .08, .76);
      ctx.fillRect(-.38, side * 1.48 - .04, .76, .08);
    }
    printGroundShadows(ctx);
  }, 4);
}

function stencil({ title, subtitle = '', color = cream, background = '#212623', arrow = false, stripe = false }) {
  return canvasTexture(768, 256, (ctx, width, height) => {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 12, height);
    ctx.fillRect(12, 19, width - 31, 3);
    ctx.fillRect(12, height - 23, width - 31, 3);
    if (stripe) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(width - 125, 23, 106, height - 46);
      ctx.clip();
      for (let offset = -96; offset < height + 30; offset += 52) {
        ctx.beginPath();
        ctx.moveTo(width - 126, offset + 119);
        ctx.lineTo(width - 15, offset);
        ctx.lineTo(width - 15, offset + 22);
        ctx.lineTo(width - 126, offset + 141);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
    if (arrow) {
      ctx.beginPath();
      ctx.moveTo(width - 115, 127);
      ctx.lineTo(width - 40, 60);
      ctx.lineTo(width - 37, 109);
      ctx.lineTo(width - 21, 109);
      ctx.lineTo(width - 21, 145);
      ctx.lineTo(width - 37, 145);
      ctx.lineTo(width - 40, 195);
      ctx.closePath();
      ctx.fill();
    }
    const space = width - (arrow || stripe ? 172 : 65);
    ctx.font = '900 italic 134px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, 33, subtitle ? 99 : 127, space);
    if (subtitle) {
      ctx.font = '700 42px monospace';
      ctx.fillText(subtitle, 39, 197, space);
    }
    const random = randomFrom(110);
    for (let i = 0; i < 900; i++) {
      const x = random() * width;
      const y = random() * height;
      ctx.fillStyle = i % 3 ? '#26292275' : '#f8dfa549';
      ctx.fillRect(x, y, 1 + random() * (i < 38 ? 19 : 3), .8 + random() * 2);
    }
  });
}

function placard(parent, text, x, y, z, angle, width, height, surfaceOptions = {}) {
  const specification = { title: text, ...surfaceOptions };
  const key = JSON.stringify(specification);
  let material = placardSurfaces.get(key);
  if (!material) {
    material = new T.MeshBasicMaterial({ map: stencil(specification), toneMapped: false });
    placardSurfaces.set(key, material);
  }
  const plate = new T.Mesh(new T.PlaneGeometry(width, height), material);
  plate.position.set(x, y, z);
  plate.rotation.y = angle;
  parent.add(plate);
  return plate;
}

function boxBatches(parent) {
  const batches = new Map();
  const transform = new T.Object3D();
  function add(surface, x, y, z, width, height, depth, angle = 0, roll = 0) {
    const transforms = batches.get(surface) ?? [];
    batches.set(surface, transforms);
    transform.position.set(x, y, z);
    transform.rotation.set(0, angle, roll);
    transform.scale.set(width, height, depth);
    transform.updateMatrix();
    transforms.push(transform.matrix.clone());
  }
  function finish() {
    for (const [surface, transforms] of batches) {
      const mesh = new T.InstancedMesh(cube, surface, transforms.length);
      transforms.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      parent.add(mesh);
    }
  }
  return { add, finish };
}

function meshBox(parent, surface, x, y, z, width, height, depth, outline = 0) {
  const geometry = new T.BoxGeometry(width, height, depth);
  const box = new T.Mesh(geometry, surface);
  box.position.set(x, y, z);
  if (outline) {
    const line = new T.Mesh(geometry, inkSurface);
    line.scale.set(1 + outline / width, 1 + outline / height, 1 + outline / depth);
    box.add(line);
  }
  parent.add(box);
  return box;
}

function containerKit(scene, add, block, surfaces) {
  const { x, z, w, h, d } = block;
  const skin = block.number === '03' ? surfaces.teal : surfaces.rust;
  add(surfaces.dark, x, (h - .11) / 2, z, w, h - .11, d);
  add(surfaces.dark, x, h - .066, z, w - .092, .09, d - .105);
  for (const side of [-1, 1]) {
    const sideX = x + side * w / 2;
    add(skin, sideX, h * .51, z, .027, h * .88, d - .18);
    for (let offset = -d / 2 + .25; offset < d / 2 - .12; offset += .31) {
      add(surfaces.dark, sideX + side * .006, h * .5, z + offset - .043, .05, h * .81, .112);
      add(skin, sideX + side * .019, h * .513, z + offset, .067, h * .79, .063);
    }
    add(surfaces.dark, sideX, .19, z, .11, .27, d);
    add(surfaces.clean, sideX - side * .021, h - .058, z, .093, .115, d);
    const endZ = z + side * d / 2;
    for (const q of [-1, 1]) {
      add(surfaces.dark, x + q * (w / 2 - .07), h / 2, endZ, .14, h, .12);
      add(surfaces.clean, x + q * (w / 2 - .08), h - .13, endZ, .23, .24, .18);
      add(surfaces.clean, x + q * (w / 2 - .08), .13, endZ, .23, .24, .18);
      add(skin, x + q * w * .22, h * .51, endZ, w * .40, h * .86, .076);
      add(surfaces.clean, x + q * w * .22, h / 2, endZ + side * .058, .071, h * .84, .067);
      add(surfaces.dark, x + q * w * .22, h * .44, endZ + side * .084, .26, .073, .057);
    }
    placard(scene, block.number, sideX + side * .063, h * .65, z + .42, side * Math.PI / 2,
      1.64, .78, { subtitle: block.number === '03' ? 'SALVAGE' : 'RECLAIM', color: block.number === '03' ? verdigris : cream });
    placard(scene, block.number, x, h * .71, endZ + side * .092, side === 1 ? 0 : Math.PI,
      1.57, .60, { color: cream, stripe: true });
  }
}

function crateKit(scene, add, block, surfaces) {
  const { x, z, w, h, d } = block;
  add(surfaces.dark, x, (h - .105) / 2, z, w - .035, h - .105, d - .035);
  add(surfaces.dark, x, h - .049, z, w - .139, .055, d - .139);
  for (const side of [-1, 1]) {
    const endZ = z + side * (d / 2 - .01);
    const endX = x + side * (w / 2 - .01);
    add(surfaces.clean, x, h - .073, endZ, w - .108, .142, .078);
    add(surfaces.clean, endX, h - .073, z, .078, .142, d);
    add(surfaces.dark, x, .095, endZ, w - .108, .18, .076);
    add(surfaces.dark, endX, .095, z, .076, .18, d);
    for (let y = .25; y < h - .15; y += .26) {
      add(surfaces.wood, x, y, endZ, w * .93, .22, .064);
      add(surfaces.sand, endX, y, z, .064, .22, d * .92);
    }
    for (const corner of [-1, 1]) {
      add(surfaces.clean, x + corner * (w / 2 - .12), h * .49, endZ, .14, h * .84, .10);
      add(surfaces.dark, x + corner * (w / 2 - .13), h * .73, endZ + side * .046, .052, .052, .021);
    }
    add(surfaces.marker, x, h * .48, endZ + side * .048, w * .77, .076, .044, 0, side * .27);
    placard(scene, 'SPARES', endX + side * .048, h - .3, z, side * Math.PI / 2,
      Math.min(.95, d * .56), .23, { color: cream, stripe: true });
  }
}

function barrierKit(scene, add, block, surfaces) {
  const { x, z, w, h, d } = block;
  add(surfaces.sand, x, h / 2, z, w - .035, h - .14, d);
  add(surfaces.dark, x, .15, z, w, .3, d + .015);
  add(surfaces.dark, x, h - .14, z, w, .28, d + .04);
  add(surfaces.clean, x, h - .039, z, w - .018, .091, d + .06);
  for (const side of [-1, 1]) {
    const face = z + side * d / 2;
    for (const edge of [-1, 1]) {
      add(surfaces.clean, x + edge * (w / 2 - .10), h / 2, face, .18, h * .9, .084);
    }
    for (const offset of [-.49, -.1, .38]) {
      add(surfaces.clean, x + offset, h * .48, face + side * .013, .14, .69, .057, 0, -.34);
    }
    placard(scene, 'BREACH', x, h * .73, face + side * .059, side === 1 ? 0 : Math.PI,
      w * .73, .51, { subtitle: 'WEST SHORTCUT', color: sodium, stripe: true });
  }
}

function buildPerimeter(scene, add, surfaces) {
  for (const side of [-1, 1]) {
    const x = side * (bounds.x + .15);
    const z = side * (bounds.z + .15);
    add(surfaces.dark, x, 1.55, 0, .3, 3.1, bounds.z * 2 - .04);
    add(surfaces.sand, 0, 1.55, z, bounds.x * 2 + .30, 3.1, .3);
    add(surfaces.clean, x, 3.13, 0, .44, .16, bounds.z * 2 + .55);
    add(surfaces.clean, 0, 3.13, z, bounds.x * 2 + .45, .16, .44);
    add(surfaces.dark, 0, .42, z - side * .14, bounds.x * 2 + .40, .84, .09);
    add(surfaces.marker, 0, .91, z - side * .17, bounds.x * 2 + .35, .052, .066);
    for (let row = -bounds.z + 2; row < bounds.z - 3; row += 3.3) {
      add(surfaces.clean, x - side * .15, 1.55, row, .33, 3.21, .13);
      add(surfaces.teal, x - side * .174, 1.76, row + 1.57, .07, 1.49, 2.91);
      add(surfaces.clean, x - side * .19, 1.02, row + 1.57, .09, .072, 2.9);
      add(surfaces.marker, x - side * .19, 2.51, row + 1.57, .041, .038, 2.88);
    }
    for (let column = -bounds.x + 2; column <= bounds.x - 2; column += 3) {
      add(surfaces.clean, column, 1.64, z - side * .14, .12, 3.20, .13);
      add(surfaces.dark, column - .59, 2.66, z - side * .19, .83, .36, .075);
    }
    for (const inOut of [-1, 1]) {
      const lampZ = inOut * 5.4;
      add(surfaces.dark, side * (bounds.x - .27), 3.47, lampZ, .18, 6.5, .24);
      add(surfaces.clean, side * (bounds.x - .81), 6.56, lampZ, 1.24, .17, .23);
      add(surfaces.dark, side * (bounds.x - 1.33), 6.51, lampZ, .59, .23, .44);
      add(surfaces.light, side * (bounds.x - 1.35), 6.396, lampZ, .47, .049, .32);
    }
    placard(scene, side === 1 ? 'FLANK' : 'WEST', x - side * .26, 1.9, -3.01, -side * Math.PI / 2, 2.40, .78,
      { subtitle: side === 1 ? 'MAINTENANCE LANE' : 'GATE APPROACH', color: side === 1 ? verdigris : sodium });
  }
}

function brokenFencing(scene, add, surfaces) {
  const map = canvasTexture(768, 192, (ctx, width, height) => {
    ctx.strokeStyle = '#303431';
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let x = -height; x < width + height; x += 27) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x + height, height);
      ctx.moveTo(x, 0);
      ctx.lineTo(x - height, height);
    }
    ctx.stroke();
  });
  const chainLink = new T.MeshBasicMaterial({ map, alphaTest: .49, side: T.DoubleSide });
  for (const side of [-1, 1]) {
    for (const [z, width, height] of [[-9.1, 3.65, .96], [side * .8, 2.57, 1.18], [9.64, 3.45, 1.05]]) {
      const roll = side * (z > 2 ? .11 : -.045);
      const x = side * (bounds.x + .27);
      const fence = new T.Mesh(new T.PlaneGeometry(width, height), chainLink);
      fence.position.set(x, 3.22 + height / 2, z);
      fence.rotation.set(0, side * Math.PI / 2, roll);
      scene.add(fence);
      for (const edge of [-1, 1]) {
        const borderZ = z + edge * width * .499;
        add(surfaces.dark, x, 3.72, borderZ, .075, 1.20, .06);
        add(surfaces.clean, x, 4.12, borderZ, .11, .03, .11);
      }
    }
  }
}

function gantry(scene, add, z, surfaces) {
  for (const side of [-1, 1]) {
    const x = side * 7.05;
    add(surfaces.dark, x, 4.57, z, .52, 9.14, .8);
    add(surfaces.clean, x - side * .21, 4.72, z, .18, 8.98, .91);
    add(surfaces.rust, x, .55, z, 1.35, 1.1, 1.52);
    for (let level = 1.3; level < 8.9; level += .37) {
      add(surfaces.marker, x + side * .34, level, z + .28, .42, .046, .11);
    }
    add(surfaces.clean, side * 6.51, 6.43, z, .23, 1.88, .35, 0, -side * .68);
    add(surfaces.rust, side * 7.23, 9.42, z, .99, .45, .91);
    add(surfaces.light, side * 7.23, 9.69, z, .42, .12, .45);
  }
  for (const height of [6.96, 9.14]) add(surfaces.dark, 0, height, z, 15.4, .37, .83);
  for (let x = -6; x <= 6; x += 2) {
    add(surfaces.clean, x, 8.04, z, .17, 2.79, .27, 0, (x % 4 ? -1 : 1) * .68);
  }
  add(surfaces.dark, 0, 7.72, z + .44, 7.05, 2.22, .25);
  placard(scene, 'NIGHT SHIFT', 0, 7.75, z + .58, 0, 6.83, 1.92,
    { subtitle: 'FREIGHT TRANSFER', color: cream, stripe: true });
}

function receiver(scene, add, x, z, surfaces) {
  add(surfaces.dark, x, 2.8, z, 4.06, 5.6, 2.54);
  add(surfaces.teal, x, 4.36, z + 1.3, 3.82, 1.98, .115);
  add(surfaces.dark, x, 4.83, z + 1.39, 3.5, .49, .08);
  for (const offset of [-1.11, -.36, .38, 1.12]) {
    add(surfaces.clean, x + offset, 4.84, z + 1.44, .05, .51, .07, 0, -.13);
  }
  add(surfaces.rust, x, 5.6, z, 4.15, .24, 2.75, 0, -.06);
  add(surfaces.dark, x + .81, 6.32, z - .52, .64, 1.37, .44);
  add(surfaces.clean, x + .81, 6.88, z - .52, 1.7, .11, .13, .22, .26);
  add(surfaces.dark, x - .76, 6.95, z + .22, .30, 2.67, .3, 0, -.21);
  add(surfaces.clean, x - .67, 7.78, z + .22, 2.15, .082, .1, .15, -.35);
  add(surfaces.dark, x - .65, 7.43, z + .19, 1.41, .042, .088, .15, -.35);
  add(surfaces.light, x - 1.36, 8.06, z + .37, .13, .11, .17);
  placard(scene, 'RELAY', x - .25, 3.83, z + 1.38, 0, 2.48, .49, { color: verdigris, stripe: true });
}

function utilities(scene, add, surfaces) {
  receiver(scene, add, -13.7, -bounds.z - 5.7, surfaces);
  receiver(scene, add, 15.0, -bounds.z - 4.4, surfaces);
  for (const side of [-1, 1]) {
    const towerX = side * (bounds.x + 3.7);
    const towerZ = -5 + side * 4.7;
    for (const step of [-1, 1]) {
      add(surfaces.dark, towerX + step * 1.3, 5.15, towerZ, .21, 10.3, .25);
      add(surfaces.clean, towerX, 6.7 + step * 1.3, towerZ, .145, 3.52, .22, 0, step * .8);
    }
    add(surfaces.dark, towerX, 10.1, towerZ, 3.70, .27, 3.7);
    add(surfaces.clean, towerX, 10.41, towerZ, 3.18, .64, 3.4);
    add(surfaces.rust, towerX, 11.01, towerZ, 3.08, .87, 3.15);
    add(surfaces.dark, towerX, 11.58, towerZ, 3.29, .28, 3.38);
    add(surfaces.dark, towerX + side * .33, 12.42, towerZ, .12, 1.62, .12);
    add(surfaces.light, towerX + side * .33, 13.19, towerZ, .16, .22, .16);
    for (const index of [0, 1, 2]) {
      const tankZ = 4 + index * 3.5 - (side === 1 ? 10 : 0);
      const tank = new T.Mesh(new T.CylinderGeometry(1.21, 1.26, 4.82 - index * .52, 7), index === 1 ? surfaces.rust : surfaces.dark);
      tank.position.set(towerX, 2.42 - index * .26, tankZ);
      scene.add(tank);
      const cap = new T.Mesh(new T.CylinderGeometry(.47, 1.25, .52, 7), surfaces.clean);
      cap.position.set(towerX, 5.02 - index * .52, tankZ);
      scene.add(cap);
      add(surfaces.clean, towerX - side * .73, 4.84 - index * .52, tankZ + .38, .11, 1.22, .14);
    }
  }
}

function makeShutter(scene, add, surfaces) {
  const assembly = new T.Group();
  assembly.position.set(shutter.x, 0, shutter.z);
  scene.add(assembly);
  const backing = meshBox(assembly, surfaces.dark, 0, shutter.h / 2, 0,
    shutter.w - .024, shutter.h - .026, .088);
  const panels = [];
  const halfPanel = shutter.w / 2;
  const panelHeight = shutter.h / 3;
  for (let row = 0; row < 3; row++) {
    for (const side of [-1, 1]) {
      const y = (row + .5) * panelHeight;
      const x = side * halfPanel / 2;
      const panel = new T.Group();
      panel.position.set(x, y, 0);
      assembly.add(panel);
      panels.push({ panel, x, y, side, row });
      meshBox(panel, surfaces.rust, 0, 0, 0, halfPanel - .021, panelHeight - .022, shutter.d, .011);
      const trim = boxBatches(panel);
      for (const face of [-1, 1]) {
        trim.add(surfaces.dark, 0, .21, face * .083, halfPanel * .979, .058, .047);
        trim.add(surfaces.clean, 0, .183, face * .109, halfPanel * .974, .025, .014);
        trim.add(surfaces.marker, side * (halfPanel / 2 - .097), -.09, face * .094, .103, .21, .034);
        if (row === 1) {
          placard(panel, side < 0 ? 'BREACH' : '03', 0, -.074, face * .118, face > 0 ? 0 : Math.PI,
            halfPanel * .92, .48, { color: cream, stripe: side > 0 });
        }
      }
      trim.finish();
    }
  }
  for (const side of [-1, 1]) {
    const x = shutter.x + side * (shutter.w / 2 + .062);
    add(surfaces.dark, x, 1.43, 0, .18, 2.86, .30);
    add(surfaces.clean, x, 1.43, .133, .113, 2.71, .076);
    for (let y = .45; y < 2.68; y += .43) {
      add(surfaces.marker, x, y, .184, .094, .135, .028, 0, -side * .38);
    }
  }
  add(surfaces.dark, shutter.x, 2.79, 0, shutter.w + .21, .21, .39);
  add(surfaces.clean, shutter.x, 2.86, 0, shutter.w + .23, .058, .41);
  const lights = [0, 1, 2].flatMap(index => [-1, 1].map(side =>
    meshBox(assembly, surfaces.light, (index - 1) * .16, 2.79, side * .204, .08, .052, .024)));
  let hitPoints = shutterMaxHP;
  let changedAt = -10000;
  return (nextHitPoints, now) => {
    if (nextHitPoints !== hitPoints) {
      hitPoints = nextHitPoints;
      changedAt = now;
    }
    const elapsed = now - changedAt;
    const collapse = Math.min(elapsed / 550, 1);
    backing.visible = hitPoints > 0;
    lights.forEach((light, index) => { light.visible = Math.floor(index / 2) < hitPoints; });
    for (const { panel, x, y, side, row } of panels) {
      panel.visible = hitPoints > 0 || collapse < 1;
      const dent = (shutterMaxHP - hitPoints) * .025 * (row % 2 ? -1 : 1);
      const jolt = Math.sin(elapsed * .036) * Math.exp(-elapsed / 66) * .06;
      if (hitPoints > 0) {
        panel.position.set(x, y, dent * .6 + jolt);
        panel.rotation.set(0, dent * side, jolt * side * .32);
      } else {
        panel.position.set(x + side * collapse * halfPanel, y - collapse * collapse * (y + .12),
          (row - 1) * .43 * collapse + side * .24 * collapse);
        panel.rotation.set(collapse * 1.6, side * collapse * .94, side * collapse * .5);
      }
    }
  };
}

function transferCrane(scene, add, surfaces) {
  const { dark, rust, clean, marker, teal, light } = surfaces;
  const span = bounds.x + .8;
  const railHeight = 6.9;
  // The feet are outside the playing field. All steel over the floor clears the players.
  for (const z of [-bounds.z + 1, 0, bounds.z - 1]) {
    for (const side of [-1, 1]) {
      const x = span * side;
      add(dark, x, 3.93, z, .72, 7.86, 1.35);
      add(rust, x - side * .13, 4.86, z, .76, 5.8, 1.12);
      add(marker, x, 2.2, z, .86, .32, 1.44);
      add(rust, x - side * 1.22, 6.62, z, .37, 4.35, .88, 0, -side * .65);
      add(light, x - side * 2.46, 6.87, z, .44, .10, .65);
    }
    // Two skin plates, with a silhouette of alternating compression diagonals between them.
    for (const side of [-1, 1]) {
      const face = z + side * .49;
      add(rust, 0, 7.35, face, span * 2 + 1.1, .35, .22);
      add(dark, 0, 8.94, face, span * 2 + 1.1, .26, .25);
      for (let x = -span + 1; x < span; x += 2) {
        const sign = Math.round((x + span - 1) / 2) % 2 ? 1 : -1;
        add(rust, x, 8.15, face, .19, 2.55, .17, 0, sign * .91);
      }
    }
    add(dark, 0, 7.25, z, 4.1, .34, 1.67);
  }
  for (const side of [-1, 1]) {
    add(dark, side * .55, railHeight + .06, 0, .24, .42, bounds.z * 2);
    add(marker, side * .55, railHeight - .14, 0, .42, .10, bounds.z * 2);
  }
  // Offset operator cab and counterweight leave the sightline down the main lane open.
  add(dark, -4.25, 6.83, 0, 3.3, .35, 2.06);
  add(teal, -4.36, 7.54, 0, 2.42, 1.17, 1.98);
  add(rust, -4.3, 8.22, 0, 2.8, .25, 2.16);
  for (const side of [-1, 1]) {
    add(dark, -4.35, 7.71, side * 1.00, 1.91, .53, .038);
    for (const pane of [-.52, .47]) add(clean, -4.35 + pane, 7.69, side * 1.03, .053, .54, .03, 0, -.14);
    placard(scene, 'HOIST', 2.91, 8.05, side * .64, side > 0 ? 0 : Math.PI,
      3.55, .99, { color: cream, background: '#864b20', stripe: true });
  }
  const trolley = new T.Group();
  trolley.name = 'Transfer crane trolley';
  scene.add(trolley);
  const truck = boxBatches(trolley);
  truck.add(dark, 0, 6.71, 0, 1.90, .46, 2.35);
  truck.add(marker, 0, 6.49, 0, 1.73, .25, 2.12);
  for (const x of [-.77, .77]) {
    for (const z of [-.75, .75]) truck.add(dark, x, 6.93, z, .41, .42, .64);
    truck.add(rust, x, 6.47, 0, .27, .52, 1.9);
  }
  truck.finish();

  const rope = new T.Group();
  trolley.add(rope);
  const wires = boxBatches(rope);
  for (const x of [-.33, .33]) wires.add(dark, x, -.5, 0, .044, 1, .044);
  wires.finish();
  rope.position.y = 6.45;

  const yoke = new T.Group();
  yoke.name = 'Charging clamp';
  trolley.add(yoke);
  const steelwork = boxBatches(yoke);
  steelwork.add(dark, 0, .26, 0, 1.46, .41, .85);
  steelwork.add(marker, 0, .29, 0, 1.39, .27, .90);
  for (const x of [-.47, 0, .47]) {
    for (const z of [-.46, .46]) steelwork.add(dark, x, .29, z, .12, .31, .025, 0, -.47);
  }
  steelwork.add(light, 0, .04, 0, .58, .044, .49);
  steelwork.finish();
  const jawGeometry = new T.Shape();
  [[0,0],[.14,.015],[.21,-.31],[.14,-.55],[-.08,-.61],[-.17,-.51],[.04,-.42],[.085,-.28]]
    .forEach(([x,y], i) => i ? jawGeometry.lineTo(x,y) : jawGeometry.moveTo(x,y));
  jawGeometry.closePath();
  const jawShape = new T.ExtrudeGeometry(jawGeometry, { depth:.19, bevelEnabled:false });
  const jaws = [-1, 1].map(side => {
    const pivot = new T.Group();
    const jaw = new T.Mesh(jawShape, rust);
    jaw.scale.x = side;
    jaw.position.z = -.095;
    pivot.add(jaw);
    yoke.add(pivot);
    pivot.position.x = side * .34;
    return pivot;
  });

  const shadow = new T.Mesh(new T.CircleGeometry(1, 12),
    new T.MeshBasicMaterial({ color:0x161c1d, transparent:true, opacity:.22, depthWrite:false }));
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);
  const gates = teams.map(team => {
    // Shutters move across the existing end wall, never into the navigable apron.
    const z = Math.sign(team.goal.z) * (bounds.z - .26);
    const doors = [-1, 1].map(side => {
      const door = new T.Group();
      scene.add(door);
      const pieces = boxBatches(door);
      pieces.add(teal, 0, 1.49, 0, 1.95, 2.81, .12);
      for (const y of [.46, .97, 1.48, 2.0, 2.51]) pieces.add(dark, 0, y, 0, 1.91, .067, .145);
      pieces.add(marker, -side * .86, 1.5, 0, .13, 2.68, .175);
      pieces.finish();
      door.position.set(side, 0, z);
      return door;
    });
    return { doors, z:team.goal.z };
  });

  return (z, height, jawOpen, signalZ, approach, cellX) => {
    trolley.position.z = z;
    rope.position.x = yoke.position.x = cellX;
    yoke.position.y = height;
    rope.scale.y = Math.max(.05, rope.position.y - height - .43);
    jaws.forEach((jaw,i) => { jaw.rotation.z = (i ? 1 : -1) * jawOpen * .62; });
    shadow.position.set(cellX + height * .17, .09, z + height * .12);
    shadow.scale.set(.5 + height * .095, .37 + height * .075, 1);
    for (const gate of gates) {
      const opening = Math.abs(gate.z - signalZ) < 2.5 ? approach : 0;
      gate.doors.forEach((door,i) => { door.position.x = (i ? 1 : -1) * (1 + opening * 1.46); });
    }
  };
}

function batteryObjective(scene, add, surfaces) {
  const group = new T.Group();
  group.name = 'Salvage Power Cell';
  scene.add(group);
  meshBox(group, surfaces.dark, 0, 0, 0, .40, .61, .36, .038);
  meshBox(group, surfaces.battery, 0, -.014, 0, .35, .37, .429, .021);
  meshBox(group, surfaces.clean, 0, .263, 0, .48, .12, .4, .023);
  meshBox(group, surfaces.clean, 0, -.267, 0, .47, .1, .4, .023);
  for (const side of [-1, 1]) {
    meshBox(group, surfaces.dark, side * .186, 0, 0, .058, .51, .45, .02);
    meshBox(group, surfaces.charge, side * .225, -.02, 0, .027, .261, .23);
    meshBox(group, surfaces.charge, 0, .033, side * .223, .2, .074, .022);
  }
  meshBox(group, surfaces.dark, -.112, .371, 0, .063, .12, .10, .018);
  meshBox(group, surfaces.dark, .112, .371, 0, .063, .12, .10, .018);
  meshBox(group, surfaces.clean, 0, .422, 0, .28, .058, .092, .021);

  const ring = new T.Group();
  const marker = new T.MeshBasicMaterial({ color: volt, opacity: .86, transparent: true, side: T.DoubleSide, depthWrite: false });
  for (const side of [0, 1, 2, 3]) {
    const arc = new T.Mesh(new T.RingGeometry(.69, .726, 7, 1, side * Math.PI / 2 + .12, 1.10), marker);
    arc.rotation.x = -Math.PI / 2;
    ring.add(arc);
  }
  ring.position.y = .022;
  scene.add(ring);

  for (const [index, team] of teams.entries()) {
    const color = index === 0 ? sodium : verdigris;
    const lamp = new T.MeshBasicMaterial({ color, toneMapped: false });
    const z = team.goal.z;
    const direction = Math.sign(z);
    add(surfaces.dark, 0, .024, z, 3.55, .043, 2.55);
    add(surfaces.clean, 0, .05, z, 3.29, .012, 2.29);
    add(surfaces.dark, 0, .062, z, 3.08, .012, 2.10);
    for (const side of [-1, 1]) {
      add(lamp, side * 1.58, .073, z, .055, .015, 2.22);
      add(lamp, 0, .073, z + side * 1.107, 3.15, .015, .053);
      for (let x = .38; x < 1.3; x += .31) {
        add(lamp, x * side, .077, z + direction * .79, .10, .019, .43, direction * side * .42);
      }
    }
    placard(scene, index === 0 ? 'EMBER' : 'TIDE', 0, 3.40, direction * (bounds.z - .12),
      direction > 0 ? Math.PI : 0, 3.54, .90, { subtitle: 'BATTERY RETURN', color, stripe: true });
  }

  const moveCrane = transferCrane(scene, add, surfaces);
  let parkedZ = 0, parkedY = 4.2, lastTime = 0;
  return (state, now, slot) => {
    const battery = state?.battery;
    const carrier = state?.players?.[battery?.carrier];
    const motion = battery?.motion;
    const carried = battery?.carrier != null;
    const dt = Math.min(.05, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    let x = battery?.x ?? 0, z = battery?.z ?? 0;
    let height = .34, yaw = Math.sin(now * .0013) * .06, roll = 0;
    let gateZ = 0, opening = 0, claw = 1;
    const attached = motion?.kind === 'arrival' || motion?.kind === 'delivery';
    if (attached) {
      const p = motion.progress;
      const delivery = motion.kind === 'delivery';
      const transit = T.MathUtils.smoothstep(p, .26, .71);
      x = T.MathUtils.lerp(motion.fromX, motion.toX, transit);
      z = T.MathUtils.lerp(motion.fromZ, motion.toZ, transit);
      const lift = delivery ? T.MathUtils.smoothstep(p, 0, .25) : 1;
      const lower = T.MathUtils.smoothstep(p, delivery ? .71 : .05, .96);
      height = .34 + (delivery ? .76 * (1 - lift) : 0) + 3.50 * lift * (1 - lower);
      yaw = 0;
      roll = Math.sin(transit * Math.PI * 2) * .10;
      parkedZ = z;
      parkedY = height + .79;
      claw = T.MathUtils.smoothstep(p, .92, 1);
      gateZ = motion.fromZ;
      opening = delivery ? 1 - T.MathUtils.smoothstep(p, .36, .72) : 0;
    } else {
      if (carried && carrier) {
        const cos = Math.cos(carrier.yaw), sin = Math.sin(carrier.yaw);
        x = carrier.x - .29 * cos + .20 * sin;
        z = carrier.z - .29 * sin - .20 * cos;
        height = 1.10;
        yaw = -carrier.yaw;
        gateZ = teams[carrier.team].goal.z;
        opening = 1 - T.MathUtils.smoothstep(Math.hypot(carrier.x, carrier.z - gateZ), 1.6, 7);
      } else if (motion?.kind === 'drop') {
        const p = motion.progress;
        const slide = 1 - (1 - p) ** 2;
        x = T.MathUtils.lerp(motion.fromX, motion.toX, slide);
        z = T.MathUtils.lerp(motion.fromZ, motion.toZ, slide);
        height = Math.max(.34, 1.1 - 2.8 * p * p) + .14 * Math.sin(Math.PI * T.MathUtils.smoothstep(p, .52, .93));
        roll = -.35 * Math.sin(p * Math.PI * 2) * (1 - p);
        yaw = p * 1.6;
      }
      parkedZ += T.MathUtils.clamp(gateZ - parkedZ, -dt * 16, dt * 16);
      const targetY = 4.1 - opening * 2.2;
      parkedY += (targetY - parkedY) * (1 - Math.exp(-dt * 8));
    }
    group.visible = (battery?.visible !== false || !!motion) && !(!motion && battery?.carrier === slot);
    group.position.set(x, height, z);
    group.rotation.set(0, yaw, roll);
    ring.visible = group.visible && !carried && (!attached || motion.progress > .72);
    ring.position.set(attached ? motion.toX : x, .09, attached ? motion.toZ : z);
    ring.rotation.y = -now * .00055;
    marker.opacity = .67 + Math.sin(now * .005) * .18;
    moveCrane(parkedZ, parkedY, claw, gateZ, opening, attached ? x : 0);
  };
}

export function createWastelandEnvironment(scene, { surfaceTexture, floorTexture } = {}) {
  const print = surfaceTexture ?? printedMetal();
  const surface = (color, map = print) => new T.MeshToonMaterial({ color, map, gradientMap: tones });
  const flat = color => surface(color, null);
  const surfaces = {
    dark: surface(0x343a38), clean: surface(0x706e64), teal: surface(0x4b7470),
    rust: surface(0xa26947), wood: surface(0x967554), sand: surface(0xaa9475),
    marker: flat(0xbe995b),
    light: new T.MeshBasicMaterial({ color: '#ffb56e', toneMapped: false }),
    charge: new T.MeshBasicMaterial({ color: '#d9ed84', toneMapped: false }),
    battery: new T.MeshStandardMaterial({ color: 0xc9e772, emissive: 0x96bf51, emissiveIntensity: .55 }),
  };
  const floorMap = floorPlan(floorTexture?.image);
  const floor = new T.Mesh(new T.PlaneGeometry(bounds.x * 2 + .28, bounds.z * 2 + .28),
    new T.MeshLambertMaterial({ map: floorMap }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const { add, finish } = boxBatches(scene);
  buildPerimeter(scene, add, surfaces);
  brokenFencing(scene, add, surfaces);
  gantry(scene, add, -bounds.z - 2.8, surfaces);
  utilities(scene, add, surfaces);
  for (const block of cover) {
    if (block.kind === 'container') containerKit(scene, add, block, surfaces);
    else if (block.kind === 'crate') crateKit(scene, add, block, surfaces);
    else barrierKit(scene, add, block, surfaces);
  }
  const updateShutter = makeShutter(scene, add, surfaces);
  const updateBattery = batteryObjective(scene, add, surfaces);
  finish();

  return {
    update(state, now, slot) {
      updateShutter(state?.shutterHP ?? shutterMaxHP, now);
      updateBattery(state, now, slot);
    },
  };
}
