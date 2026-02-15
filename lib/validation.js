/**
 * Validation helper functions for WLED adapter
 */

/**
 * Validate a byte value (0-255)
 *
 * @param {any} value - Value to validate
 * @param {string} name - Name of the parameter for logging
 * @param {object} logger - Logger instance with warn method
 * @returns {number|undefined} - Validated integer value or undefined if invalid
 */
function validateByteValue(value, name, logger) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        logger.warn(`Ignoring invalid ${name} value: ${value} (expected number 0-255)`);
        return undefined;
    }
    const intVal = Math.round(value);
    if (intVal < 0 || intVal > 255) {
        logger.warn(`Ignoring out-of-range ${name} value: ${value} (expected 0-255)`);
        return undefined;
    }
    return intVal;
}

/**
 * Validate color array format: [[r,g,b], ...]
 *
 * @param {any} colVal - Value to validate
 * @param {object} logger - Logger instance with warn method
 * @returns {Array|null} - Sanitized color array or null if invalid
 */
function validateSegmentColors(colVal, logger) {
    if (!Array.isArray(colVal)) {
        logger.warn(`Ignoring invalid col value: expected array, got ${typeof colVal}`);
        return null;
    }

    const sanitizedColors = [];

    for (let i = 0; i < colVal.length; i++) {
        const color = colVal[i];
        if (!Array.isArray(color) || color.length < 3) {
            logger.warn(`Ignoring invalid color entry at index ${i}: expected [r,g,b] array`);
            continue;
        }

        const rgb = [];
        for (let j = 0; j < 3; j++) {
            const channel = color[j];
            if (typeof channel !== 'number' || !Number.isFinite(channel)) {
                logger.warn(`Ignoring invalid color channel at col[${i}][${j}]: ${channel} (expected number 0-255)`);
                rgb.length = 0;
                break;
            }
            const intChannel = Math.round(channel);
            if (intChannel < 0 || intChannel > 255) {
                logger.warn(`Ignoring out-of-range color channel at col[${i}][${j}]: ${channel} (expected 0-255)`);
                rgb.length = 0;
                break;
            }
            rgb.push(intChannel);
        }

        // Only add fully valid RGB entries
        if (rgb.length === 3) {
            sanitizedColors.push(rgb);
        }
    }

    if (!sanitizedColors.length) {
        logger.warn('Ignoring col because no valid color entries were found');
        return null;
    }

    return sanitizedColors;
}

module.exports = {
    validateByteValue,
    validateSegmentColors,
};
