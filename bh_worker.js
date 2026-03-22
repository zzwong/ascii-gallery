/*
 * bh_worker.js -- Web Worker port of trace_ray_verlet for parallel black hole rendering.
 *
 * Receives camera params + row range, traces rays, returns lum/color float arrays.
 * Uses transferable buffers for zero-copy postMessage.
 */

const BH_RS = 1.0;
const R_ISCO = 3.0;
const R_OUTER = 12.0;

function blackbodyColor(temp) {
    if (temp < 0) temp = 0;
    if (temp > 1) temp = 1;
    let r, g, b;
    if (temp < 0.33) {
        const t = temp / 0.33;
        r = 0.5 + 0.5 * t;
        g = 0.1 * t * t;
        b = 0;
    } else if (temp < 0.66) {
        const t = (temp - 0.33) / 0.33;
        r = 1.0;
        g = 0.1 + 0.7 * t;
        b = 0.05 + 0.3 * t * t;
    } else {
        const t = (temp - 0.66) / 0.34;
        r = 1.0 - 0.15 * t;
        g = 0.8 + 0.2 * t;
        b = 0.35 + 0.65 * t;
    }
    return [r, g, b];
}

function traceRay(ox, oy, oz, dx, dy, dz, diskTime) {
    let x = ox, y = oy, z = oz;
    let vx = dx, vy = dy, vz = dz;

    const vmag = Math.sqrt(vx * vx + vy * vy + vz * vz);
    if (vmag < 1e-12) return [0, 0, 0, 0];
    const iv = 1.0 / vmag;
    vx *= iv; vy *= iv; vz *= iv;

    const dt = 0.25;
    const maxSteps = 150;

    let r2 = x * x + y * y + z * z;
    let r = Math.sqrt(r2);
    let hx = y * vz - z * vy, hy = z * vx - x * vz, hz = x * vy - y * vx;
    let h2 = hx * hx + hy * hy + hz * hz;
    let r5 = r2 * r2 * r;
    let f = -1.5 * h2 / r5;
    let ax = f * x / r, ay = f * y / r, az = f * z / r;

    let totalLum = 0, totalR = 0, totalG = 0, totalB = 0;

    for (let step = 0; step < maxSteps; step++) {
        const prevY = y;

        x += vx * dt + 0.5 * ax * dt * dt;
        y += vy * dt + 0.5 * ay * dt * dt;
        z += vz * dt + 0.5 * az * dt * dt;

        r2 = x * x + y * y + z * z;
        r = Math.sqrt(r2);

        if (r < BH_RS) {
            if (totalLum > 0) return [Math.min(totalLum, 1), totalR, totalG, totalB];
            return [0, 0, 0, 0];
        }

        hx = y * vz - z * vy; hy = z * vx - x * vz; hz = x * vy - y * vx;
        h2 = hx * hx + hy * hy + hz * hz;
        r5 = r2 * r2 * r;
        f = -1.5 * h2 / r5;
        const ax2 = f * x / r, ay2 = f * y / r, az2 = f * z / r;

        vx += 0.5 * (ax + ax2) * dt;
        vy += 0.5 * (ay + ay2) * dt;
        vz += 0.5 * (az + az2) * dt;
        ax = ax2; ay = ay2; az = az2;

        if (prevY * y <= 0 && (prevY !== 0 || y !== 0)) {
            const frac = Math.abs(prevY) / (Math.abs(prevY) + Math.abs(y) + 1e-12);
            const cx = x - vx * dt * (1 - frac);
            const cz = z - vz * dt * (1 - frac);
            const cr = Math.sqrt(cx * cx + cz * cz);

            if (cr >= R_ISCO && cr <= R_OUTER) {
                let brightness = Math.sqrt(R_ISCO / cr);
                const phi = Math.atan2(cz, cx) + diskTime;
                const doppler = 1.0 + 0.35 * Math.sin(phi);
                const band = 0.85 + 0.15 * Math.sin(cr * 3 - diskTime * 2);
                const spiral = 0.9 + 0.1 * Math.sin(phi * 2 - cr * 0.8 + diskTime * 1.5);
                let lum = brightness * doppler * band * spiral;
                if (lum < 0) lum = 0;
                if (lum > 1) lum = 1;

                let temp = brightness + 0.15 * Math.sin(phi);
                if (temp < 0) temp = 0;
                if (temp > 1) temp = 1;

                const [cr2, cg, cb] = blackbodyColor(temp);
                totalR += cr2 * lum;
                totalG += cg * lum;
                totalB += cb * lum;
                totalLum += lum;

                if (totalLum > 1.5) break;
            }
        }

        if (r > 50) break;
    }

    if (totalLum > 0) {
        if (totalLum > 1) {
            const inv = 1.0 / totalLum;
            totalR *= inv;
            totalG *= inv;
            totalB *= inv;
            totalLum = 1;
        }
        return [totalLum, totalR, totalG, totalB];
    }
    return [0, 0, 0, 0];
}

onmessage = function(e) {
    const d = e.data;
    const { cols, rows, hc, rowStart, rowEnd,
            camX, camY, camZ,
            fwdX, fwdY, fwdZ,
            rightX, rightY, rightZ,
            upX, upY, upZ,
            ax, ay, diskTime, requestId } = d;

    const count = (rowEnd - rowStart) * hc;
    const lum = new Float32Array(count);
    const colR = new Float32Array(count);
    const colG = new Float32Array(count);
    const colB = new Float32Array(count);

    let idx = 0;
    for (let sy = rowStart; sy < rowEnd; sy++) {
        for (let sx = 0; sx < hc; sx++) {
            let u = (2.0 * (sx / 2.0) - cols) / cols;
            let v = (rows - 2.0 * (sy / 3.0)) / rows;
            u += (sx % 2 === 0 ? -0.25 : 0.25) / cols;
            v += ((2 - sy % 3) - 1.0) * 0.333 / rows;

            const dx = fwdX + u * ax * rightX + v * ay * upX;
            const dy = fwdY + u * ax * rightY + v * ay * upY;
            const dz = fwdZ + u * ax * rightZ + v * ay * upZ;

            const [l, r, g, b] = traceRay(camX, camY, camZ, dx, dy, dz, diskTime);
            lum[idx] = l;
            colR[idx] = r;
            colG[idx] = g;
            colB[idx] = b;
            idx++;
        }
    }

    postMessage({
        requestId, rowStart, rowEnd, hc,
        lum: lum.buffer,
        colR: colR.buffer,
        colG: colG.buffer,
        colB: colB.buffer
    }, [lum.buffer, colR.buffer, colG.buffer, colB.buffer]);
};
