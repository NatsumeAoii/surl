/**
 * QR Code generator — ISO/IEC 18004, pure canvas, zero dependencies.
 *
 * Key improvements over naive implementations:
 *   - Automatic mask selection (evaluates all 8 masks, picks lowest penalty)
 *   - 4-module quiet zone for reliable scanning
 *   - Integer-pixel rendering (no sub-pixel blur)
 *   - Verified capacity/EC tables from the QR specification
 *   - Supports versions 1-40, error correction level M
 *   - Byte mode encoding (UTF-8)
 */

// ─── Public API ───

export function generateQRCodeDataURL(text: string, size = 256): string {
    const modules = encodeToModules(text);
    return renderToDataURL(modules, size);
}

// ─── Types ───

type Matrix = boolean[][];

// ─── Constants ───
const EC_CODEWORDS_PER_BLOCK = [
    0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28,
    28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
];

// Number of EC blocks for EC level M (versions 1-40)
// Format: [numBlocks1, dataPerBlock1, numBlocks2?, dataPerBlock2?]
const EC_BLOCKS: number[][] = [
    [],
    [1, 16], // v1
    [1, 28], // v2
    [1, 44], // v3
    [2, 32], // v4
    [2, 43], // v5
    [4, 27], // v6
    [4, 31], // v7
    [2, 38, 2, 39], // v8
    [3, 36, 2, 37], // v9
    [4, 43, 1, 44], // v10
    [1, 50, 4, 51], // v11
    [6, 36, 2, 37], // v12
    [8, 37, 1, 38], // v13
    [4, 40, 5, 41], // v14
    [5, 41, 5, 42], // v15
    [7, 45, 3, 46], // v16
    [10, 46, 1, 47], // v17
    [9, 43, 4, 44], // v18
    [3, 44, 11, 45], // v19
    [3, 41, 13, 42], // v20
    [17, 42], // v21
    [17, 46], // v22
    [4, 47, 14, 48], // v23
    [6, 45, 14, 46], // v24
    [8, 47, 13, 48], // v25
    [19, 46, 4, 47], // v26
    [22, 45, 3, 46], // v27
    [3, 45, 23, 46], // v28
    [21, 45, 7, 46], // v29
    [19, 47, 10, 48], // v30
    [2, 46, 29, 47], // v31
    [10, 46, 23, 47], // v32
    [14, 46, 21, 47], // v33
    [14, 46, 23, 47], // v34
    [12, 47, 26, 48], // v35
    [6, 47, 34, 48], // v36
    [29, 46, 14, 47], // v37
    [13, 46, 32, 47], // v38
    [40, 47, 7, 48], // v39
    [18, 47, 31, 48], // v40
];

// Alignment pattern center positions by version
const ALIGNMENT_POSITIONS: number[][] = [
    [],
    [],
    [6, 18],
    [6, 22],
    [6, 26],
    [6, 30],
    [6, 34],
    [6, 22, 38],
    [6, 24, 42],
    [6, 26, 46],
    [6, 28, 50],
    [6, 30, 54],
    [6, 32, 58],
    [6, 34, 62],
    [6, 26, 46, 66],
    [6, 26, 48, 70],
    [6, 26, 50, 74],
    [6, 30, 54, 78],
    [6, 30, 56, 82],
    [6, 30, 58, 86],
    [6, 34, 62, 90],
    [6, 28, 50, 72, 94],
    [6, 26, 50, 74, 98],
    [6, 30, 54, 78, 102],
    [6, 28, 54, 80, 106],
    [6, 32, 58, 84, 110],
    [6, 30, 58, 86, 114],
    [6, 34, 62, 90, 118],
    [6, 26, 50, 74, 98, 122],
    [6, 30, 54, 78, 102, 126],
    [6, 26, 52, 78, 104, 130],
    [6, 30, 56, 82, 108, 134],
    [6, 34, 60, 86, 112, 138],
    [6, 30, 54, 78, 102, 126, 150],
    [6, 24, 50, 76, 102, 128, 154],
    [6, 28, 54, 80, 106, 132, 158],
    [6, 32, 58, 84, 110, 136, 162],
    [6, 26, 54, 82, 110, 138, 166],
    [6, 30, 58, 86, 114, 142, 170],
];

// ─── GF(256) Arithmetic ───

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

{
    let x = 1;
    for (let i = 0; i < 255; i++) {
        GF_EXP[i] = x;
        GF_LOG[x] = i;
        x = (x << 1) ^ (x >= 128 ? 0x11d : 0);
    }
    for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
}

function gfMul(a: number, b: number): number {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

// ─── Encoding Engine ───

function encodeToModules(text: string): Matrix {
    const data = new TextEncoder().encode(text);
    const version = selectVersion(data.length);
    const size = version * 4 + 17;

    const matrix = createMatrix(size, false);
    const reserved = createMatrix(size, false);

    // Place fixed patterns
    placeFinderPatterns(matrix, reserved, size);
    placeAlignmentPatterns(matrix, reserved, version, size);
    placeTimingPatterns(matrix, reserved, size);
    reserveFormatArea(reserved, size);
    if (version >= 7) reserveVersionArea(reserved, size);

    // Dark module
    matrix[size - 8][8] = true;
    reserved[size - 8][8] = true;

    // Encode and place data
    const dataCodewords = encodeData(data, version);
    const ecCodewords = computeEC(dataCodewords, version);
    const bits = interleaveAndToBits(dataCodewords, ecCodewords, version);
    placeBits(matrix, reserved, bits, size);

    // Select best mask (evaluate all 8, pick lowest penalty)
    const bestMask = selectBestMask(matrix, reserved, size);
    applyMask(matrix, reserved, size, bestMask);
    writeFormatInfo(matrix, size, bestMask);
    if (version >= 7) writeVersionInfo(matrix, size, version);

    return matrix;
}

function createMatrix(size: number, fill: boolean): Matrix {
    return Array.from({ length: size }, () => Array(size).fill(fill));
}

function selectVersion(dataLen: number): number {
    for (let v = 1; v <= 40; v++) {
        const capacity = getDataCapacity(v);
        const overhead = v <= 9 ? 2 : 3; // mode(4bits) + count(8or16bits) → ceil to bytes
        if (dataLen + overhead <= capacity) return v;
    }
    throw new Error('Data too long for QR code (max version 40)');
}

function getDataCapacity(version: number): number {
    const blocks = EC_BLOCKS[version];
    let total = 0;
    for (let i = 0; i < blocks.length; i += 2) {
        total += blocks[i] * blocks[i + 1];
    }
    return total;
}

// ─── Finder Patterns ───

function placeFinderPatterns(m: Matrix, r: Matrix, size: number) {
    const positions: [number, number][] = [
        [0, 0],
        [size - 7, 0],
        [0, size - 7],
    ];
    for (const [row, col] of positions) {
        for (let dr = -1; dr <= 7; dr++) {
            for (let dc = -1; dc <= 7; dc++) {
                const rr = row + dr,
                    cc = col + dc;
                if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
                r[rr][cc] = true;
                if (dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6) {
                    const outer = dr === 0 || dr === 6 || dc === 0 || dc === 6;
                    const inner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
                    m[rr][cc] = outer || inner;
                }
            }
        }
    }
}

// ─── Alignment Patterns ───

function placeAlignmentPatterns(m: Matrix, r: Matrix, version: number, size: number) {
    if (version < 2) return;
    const positions = ALIGNMENT_POSITIONS[version];
    for (const row of positions) {
        for (const col of positions) {
            // Skip if overlaps with finder patterns
            if (isFinderArea(row, col, size)) continue;
            for (let dr = -2; dr <= 2; dr++) {
                for (let dc = -2; dc <= 2; dc++) {
                    const rr = row + dr,
                        cc = col + dc;
                    if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
                    r[rr][cc] = true;
                    m[rr][cc] = Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
                }
            }
        }
    }
}

function isFinderArea(row: number, col: number, size: number): boolean {
    return (row <= 8 && col <= 8) || (row <= 8 && col >= size - 8) || (row >= size - 8 && col <= 8);
}

// ─── Timing Patterns ───

function placeTimingPatterns(m: Matrix, r: Matrix, size: number) {
    for (let i = 8; i < size - 8; i++) {
        m[6][i] = i % 2 === 0;
        r[6][i] = true;
        m[i][6] = i % 2 === 0;
        r[i][6] = true;
    }
}

function reserveFormatArea(r: Matrix, size: number) {
    for (let i = 0; i <= 8; i++) {
        r[8][i] = true;
        r[i][8] = true;
    }
    for (let i = 0; i < 8; i++) {
        r[8][size - 1 - i] = true;
        r[size - 1 - i][8] = true;
    }
}

function reserveVersionArea(r: Matrix, size: number) {
    for (let i = 0; i < 6; i++) {
        for (let j = size - 11; j < size - 8; j++) {
            r[i][j] = true;
            r[j][i] = true;
        }
    }
}

// ─── Data Encoding (Byte Mode) ───

function encodeData(data: Uint8Array, version: number): number[] {
    const totalDataCW = getDataCapacity(version);
    const bits: number[] = [];

    // Mode indicator: byte mode = 0100
    pushBits(bits, 0b0100, 4);

    // Character count indicator
    const countBits = version <= 9 ? 8 : 16;
    pushBits(bits, data.length, countBits);

    // Data bytes
    for (const byte of data) pushBits(bits, byte, 8);

    // Terminator (up to 4 zero bits)
    const remaining = totalDataCW * 8 - bits.length;
    pushBits(bits, 0, Math.min(4, remaining));

    // Pad to byte boundary
    while (bits.length % 8 !== 0) bits.push(0);

    // Pad codewords (alternating 0xEC, 0x11)
    const pads = [0xec, 0x11];
    let pi = 0;
    while (bits.length < totalDataCW * 8) {
        pushBits(bits, pads[pi % 2], 8);
        pi++;
    }

    // Convert bits to codewords
    const codewords: number[] = [];
    for (let i = 0; i < bits.length; i += 8) {
        let byte = 0;
        for (let j = 0; j < 8; j++) byte = (byte << 1) | (bits[i + j] || 0);
        codewords.push(byte);
    }

    return codewords;
}

function pushBits(arr: number[], value: number, count: number) {
    for (let i = count - 1; i >= 0; i--) arr.push((value >> i) & 1);
}

// ─── Error Correction (Reed-Solomon over GF(256)) ───

function computeEC(dataCodewords: number[], version: number): number[] {
    const blocks = EC_BLOCKS[version];
    const ecPerBlock = EC_CODEWORDS_PER_BLOCK[version];
    const gen = generatorPolynomial(ecPerBlock);

    const allEC: number[][] = [];
    let offset = 0;

    for (let i = 0; i < blocks.length; i += 2) {
        const numBlocks = blocks[i];
        const dataPerBlock = blocks[i + 1];
        for (let b = 0; b < numBlocks; b++) {
            const blockData = dataCodewords.slice(offset, offset + dataPerBlock);
            offset += dataPerBlock;
            allEC.push(rsEncode(blockData, ecPerBlock, gen));
        }
    }

    // Flatten EC blocks
    const result: number[] = [];
    for (let i = 0; i < ecPerBlock; i++) {
        for (const ec of allEC) {
            if (i < ec.length) result.push(ec[i]);
        }
    }
    return result;
}

function rsEncode(data: number[], ecCount: number, gen: number[]): number[] {
    const msg = new Uint8Array(data.length + ecCount);
    msg.set(data);
    for (let i = 0; i < data.length; i++) {
        const coeff = msg[i];
        if (coeff !== 0) {
            for (let j = 0; j < gen.length; j++) {
                msg[i + j] ^= gfMul(gen[j], coeff);
            }
        }
    }
    return Array.from(msg.subarray(data.length));
}

function generatorPolynomial(degree: number): number[] {
    let gen = [1];
    for (let i = 0; i < degree; i++) {
        const next = new Array(gen.length + 1).fill(0);
        for (let j = 0; j < gen.length; j++) {
            next[j] ^= gen[j];
            next[j + 1] ^= gfMul(gen[j], GF_EXP[i]);
        }
        gen = next;
    }
    return gen;
}

// ─── Interleaving ───

function interleaveAndToBits(data: number[], ec: number[], version: number): number[] {
    const blocks = EC_BLOCKS[version];

    // Split data into blocks
    const dataBlocks: number[][] = [];
    let offset = 0;
    for (let i = 0; i < blocks.length; i += 2) {
        const numBlocks = blocks[i];
        const dataPerBlock = blocks[i + 1];
        for (let b = 0; b < numBlocks; b++) {
            dataBlocks.push(data.slice(offset, offset + dataPerBlock));
            offset += dataPerBlock;
        }
    }

    // Interleave data codewords
    const interleaved: number[] = [];
    const maxDataLen = Math.max(...dataBlocks.map((b) => b.length));
    for (let i = 0; i < maxDataLen; i++) {
        for (const block of dataBlocks) {
            if (i < block.length) interleaved.push(block[i]);
        }
    }

    // EC is already interleaved from computeEC
    interleaved.push(...ec);

    // Add remainder bits based on version
    const remainderBits =
        version >= 2 && version <= 6
            ? 7
            : version >= 14 && version <= 20
              ? 3
              : version >= 21 && version <= 27
                ? 4
                : version >= 28 && version <= 34
                  ? 3
                  : 0;

    // Convert to bits
    const bits: number[] = [];
    for (const cw of interleaved) {
        for (let i = 7; i >= 0; i--) bits.push((cw >> i) & 1);
    }
    for (let i = 0; i < remainderBits; i++) bits.push(0);

    return bits;
}

// ─── Bit Placement ───

function placeBits(m: Matrix, r: Matrix, bits: number[], size: number) {
    let bitIdx = 0;
    let upward = true;

    for (let col = size - 1; col >= 0; col -= 2) {
        if (col === 6) col = 5; // Skip vertical timing column

        for (let i = 0; i < size; i++) {
            const row = upward ? size - 1 - i : i;
            for (const c of [col, col - 1]) {
                if (c < 0 || r[row][c]) continue;
                if (bitIdx < bits.length) {
                    m[row][c] = bits[bitIdx] === 1;
                    bitIdx++;
                }
            }
        }
        upward = !upward;
    }
}

// ─── Mask Selection (evaluate all 8, pick lowest penalty) ───

function selectBestMask(matrix: Matrix, reserved: Matrix, size: number): number {
    let bestMask = 0;
    let bestPenalty = Infinity;

    for (let mask = 0; mask < 8; mask++) {
        // Clone the matrix
        const test = matrix.map((row) => [...row]);
        applyMask(test, reserved, size, mask);
        const penalty = computePenalty(test, size);
        if (penalty < bestPenalty) {
            bestPenalty = penalty;
            bestMask = mask;
        }
    }

    return bestMask;
}

function computePenalty(m: Matrix, size: number): number {
    let penalty = 0;

    // Rule 1: Adjacent same-color modules in row/column (5+ in a row → 3 + (N-5))
    for (let row = 0; row < size; row++) {
        let count = 1;
        for (let col = 1; col < size; col++) {
            if (m[row][col] === m[row][col - 1]) {
                count++;
            } else {
                if (count >= 5) penalty += 3 + (count - 5);
                count = 1;
            }
        }
        if (count >= 5) penalty += 3 + (count - 5);
    }
    for (let col = 0; col < size; col++) {
        let count = 1;
        for (let row = 1; row < size; row++) {
            if (m[row][col] === m[row - 1][col]) {
                count++;
            } else {
                if (count >= 5) penalty += 3 + (count - 5);
                count = 1;
            }
        }
        if (count >= 5) penalty += 3 + (count - 5);
    }

    // Rule 2: 2×2 blocks of same color → 3 per block
    for (let row = 0; row < size - 1; row++) {
        for (let col = 0; col < size - 1; col++) {
            const v = m[row][col];
            if (v === m[row][col + 1] && v === m[row + 1][col] && v === m[row + 1][col + 1]) {
                penalty += 3;
            }
        }
    }

    // Rule 3: Finder-like patterns (1:1:3:1:1 ratio) → 40 per occurrence
    const pattern1 = [true, false, true, true, true, false, true, false, false, false, false];
    const pattern2 = [...pattern1].reverse();
    for (let row = 0; row < size; row++) {
        for (let col = 0; col <= size - 11; col++) {
            let match1 = true,
                match2 = true;
            for (let k = 0; k < 11; k++) {
                if (m[row][col + k] !== pattern1[k]) match1 = false;
                if (m[row][col + k] !== pattern2[k]) match2 = false;
            }
            if (match1 || match2) penalty += 40;
        }
    }
    for (let col = 0; col < size; col++) {
        for (let row = 0; row <= size - 11; row++) {
            let match1 = true,
                match2 = true;
            for (let k = 0; k < 11; k++) {
                if (m[row + k][col] !== pattern1[k]) match1 = false;
                if (m[row + k][col] !== pattern2[k]) match2 = false;
            }
            if (match1 || match2) penalty += 40;
        }
    }

    // Rule 4: Proportion of dark modules → 10 per 5% deviation from 50%
    let dark = 0;
    for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
            if (m[row][col]) dark++;
        }
    }
    const ratio = (dark * 100) / (size * size);
    const prev5 = Math.floor(ratio / 5) * 5;
    const next5 = prev5 + 5;
    penalty += Math.min(Math.abs(prev5 - 50) / 5, Math.abs(next5 - 50) / 5) * 10;

    return penalty;
}

// ─── Masking ───

function applyMask(m: Matrix, r: Matrix, size: number, mask: number) {
    for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
            if (r[row][col]) continue;
            let flip = false;
            switch (mask) {
                case 0:
                    flip = (row + col) % 2 === 0;
                    break;
                case 1:
                    flip = row % 2 === 0;
                    break;
                case 2:
                    flip = col % 3 === 0;
                    break;
                case 3:
                    flip = (row + col) % 3 === 0;
                    break;
                case 4:
                    flip = (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
                    break;
                case 5:
                    flip = ((row * col) % 2) + ((row * col) % 3) === 0;
                    break;
                case 6:
                    flip = (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
                    break;
                case 7:
                    flip = (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
                    break;
            }
            if (flip) m[row][col] = !m[row][col];
        }
    }
}

// ─── Format & Version Info ───

function writeFormatInfo(m: Matrix, size: number, mask: number) {
    // EC level M = 00 in QR spec format info encoding
    const ecBits = 0b00;
    const data = (ecBits << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ (rem >> 9 ? 0x537 : 0);
    const bits = ((data << 10) | rem) ^ 0x5412;

    // Positions around top-left finder
    const tlPositions: [number, number][] = [
        [8, 0],
        [8, 1],
        [8, 2],
        [8, 3],
        [8, 4],
        [8, 5],
        [8, 7],
        [8, 8],
        [7, 8],
        [5, 8],
        [4, 8],
        [3, 8],
        [2, 8],
        [1, 8],
        [0, 8],
    ];
    for (let i = 0; i < 15; i++) {
        const [r, c] = tlPositions[i];
        m[r][c] = ((bits >> (14 - i)) & 1) === 1;
    }

    // Bottom-left (vertical) + top-right (horizontal)
    for (let i = 0; i < 7; i++) {
        m[size - 1 - i][8] = ((bits >> i) & 1) === 1;
    }
    for (let i = 0; i < 8; i++) {
        m[8][size - 8 + i] = ((bits >> (7 + i)) & 1) === 1;
    }
}

function writeVersionInfo(m: Matrix, size: number, version: number) {
    if (version < 7) return;
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ (rem >> 11 ? 0x1f25 : 0);
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
        const bit = ((bits >> i) & 1) === 1;
        const row = Math.floor(i / 3);
        const col = size - 11 + (i % 3);
        m[row][col] = bit;
        m[col][row] = bit;
    }
}

// ─── Canvas Rendering (pixel-perfect with quiet zone) ───

function renderToDataURL(modules: Matrix, targetSize: number): string {
    const moduleCount = modules.length;
    const quietZone = 4; // 4 modules on each side per spec
    const totalModules = moduleCount + quietZone * 2;

    // Calculate cell size as integer for crisp rendering
    const cellSize = Math.max(1, Math.floor(targetSize / totalModules));
    const canvasSize = cellSize * totalModules;

    const canvas = document.createElement('canvas');
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // White background (includes quiet zone)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    // Dark modules — integer coordinates, no anti-aliasing
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
