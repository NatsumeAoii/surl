import type { Matrix } from './types.ts';

export function renderToDataURL(modules: Matrix, targetSize: number): string {
    const moduleCount = modules.length;
    const quietZone = 4;
    const totalModules = moduleCount + quietZone * 2;
    const cellSize = Math.max(1, Math.floor(targetSize / totalModules));
    const canvasSize = cellSize * totalModules;

    const canvas = document.createElement('canvas');
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    ctx.fillStyle = '#000000';
    for (let row = 0; row < moduleCount; row++) {
        for (let col = 0; col < moduleCount; col++) {
            if (modules[row][col]) {
                ctx.fillRect(
                    (col + quietZone) * cellSize,
                    (row + quietZone) * cellSize,
                    cellSize,
                    cellSize,
                );
            }
        }
    }

    return canvas.toDataURL('image/png');
}
