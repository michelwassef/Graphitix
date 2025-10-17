describe('Shared.plot3d helper', () => {
  beforeAll(() => {
    require('../../js/shared/plot3d.js');
  });

  it('creates, normalizes, and rotates using rotation state', () => {
    const { plot3d } = global.Shared;
    const state = plot3d.createRotationState({ x: 1, y: 2 });
    expect(state).toEqual({ x: 1, y: 2 });
    state.x = Math.PI;
    state.y = 4 * Math.PI;
    plot3d.normalizeRotation(state);
    expect(state.x).toBeCloseTo(Math.PI / 2);
    expect(state.y).toBeCloseTo(0, 10);
    const rotated = plot3d.rotatePoint({ x: 1, y: 0, z: 0 }, state);
    expect(rotated.z).toBeCloseTo(0, 10);
    expect(rotated.x).toBeLessThanOrEqual(1);
  });

  it('projects rotated points within expected bounds', () => {
    const { plot3d } = global.Shared;
    const rotatedPoints = [
      { x: -1, y: -1, z: -1 },
      { x: 1, y: 1, z: 1 }
    ];
    const rotatedCorners = [
      { x: -1, y: -1, z: -1 },
      { x: 1, y: -1, z: -1 },
      { x: -1, y: 1, z: -1 },
      { x: 1, y: 1, z: -1 },
      { x: -1, y: -1, z: 1 },
      { x: 1, y: -1, z: 1 },
      { x: -1, y: 1, z: 1 },
      { x: 1, y: 1, z: 1 }
    ];
    const projector = plot3d.createProjector({
      rotatedPoints,
      rotatedCorners,
      width: 300,
      height: 200,
      margin: { top: 10, right: 15, bottom: 20, left: 25 }
    });
    expect(projector.bounds.minX).toBeCloseTo(-1);
    expect(projector.bounds.maxY).toBeCloseTo(1);
    const projectedA = projector.project(rotatedPoints[0]);
    const projectedB = projector.project(rotatedPoints[1]);
    expect(projectedA.x).toBeGreaterThanOrEqual(25);
    expect(projectedA.y).toBeGreaterThanOrEqual(10);
    expect(projectedB.x).toBeLessThanOrEqual(300 - 15);
    expect(projectedB.y).toBeLessThanOrEqual(200 - 20);
  });
});
