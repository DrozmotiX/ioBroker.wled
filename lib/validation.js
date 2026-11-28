/**
 * Validation helper functions for WLED adapter
 */

/**
 * Validate a byte value (0-255)
 *
 * @param {any} value - Value to validate
 * @param {string} name - Name of the parameter for logging
 * @param {object} logger - Logger instance with warn method
 * @param {string} [context] - Optional context for more informative error messages (e.g., 'addSegment')
 * @returns {number|undefined} - Validated integer value or undefined if invalid
 */
function validateByteValue(value, name, logger, context) {
    const contextStr = context ? ` for ${context}` : '';
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        logger.warn(`Ignoring invalid ${name} value${contextStr}: ${value} (expected number 0-255)`);
        return undefined;
    }
    const intVal = Math.round(value);
    if (intVal < 0 || intVal > 255) {
        logger.warn(`Ignoring out-of-range ${name} value${contextStr}: ${value} (expected 0-255)`);
        return undefined;
    }
    return intVal;
}

/**
 * Validate color array format: [[r,g,b], ...] or [[r,g,b,w], ...] for strips with a white channel
 *
 * @param {any} colVal - Value to validate
 * @param {object} logger - Logger instance with warn method
 * @param {string} [context] - Optional context for more informative error messages (e.g., 'addSegment')
 * @returns {Array|null} - Sanitized color array or null if invalid
 */
function validateSegmentColors(colVal, logger, context) {
    const contextStr = context ? ` for ${context}` : '';
    if (!Array.isArray(colVal)) {
        logger.warn(`Ignoring invalid col value${contextStr}: expected array, got ${typeof colVal}`);
        return null;
    }

    const sanitizedColors = [];

    for (let i = 0; i < colVal.length; i++) {
        const color = colVal[i];
        if (!Array.isArray(color) || color.length < 3) {
            logger.warn(
                `Ignoring invalid color entry at index ${i} in col${contextStr}: expected [r,g,b] or [r,g,b,w] array`,
            );
            continue;
        }

        const rgb = [];
        const channels = color.length >= 4 ? 4 : 3;
        for (let j = 0; j < channels; j++) {
            const channel = color[j];
            if (typeof channel !== 'number' || !Number.isFinite(channel)) {
                logger.warn(
                    `Ignoring invalid color channel at col[${i}][${j}]${contextStr}: ${channel} (expected number 0-255)`,
                );
                rgb.length = 0;
                break;
            }
            const intChannel = Math.round(channel);
            if (intChannel < 0 || intChannel > 255) {
                logger.warn(
                    `Ignoring out-of-range color channel at col[${i}][${j}]${contextStr}: ${channel} (expected 0-255)`,
                );
                rgb.length = 0;
                break;
            }
            rgb.push(intChannel);
        }

        // Only add fully valid RGB or RGBW entries
        if (rgb.length === channels) {
            sanitizedColors.push(rgb);
        }
    }

    if (!sanitizedColors.length) {
        logger.warn(`Ignoring col${contextStr} because no valid color entries were found`);
        return null;
    }

    return sanitizedColors;
}

module.exports = {
    validateByteValue,
    validateSegmentColors,
};
