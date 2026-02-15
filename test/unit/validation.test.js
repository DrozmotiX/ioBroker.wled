const { expect } = require('chai');
const { validateByteValue, validateSegmentColors } = require('../../lib/validation');

describe('Validation helpers', () => {
    let mockLogger;
    let warnings;

    beforeEach(() => {
        warnings = [];
        mockLogger = {
            warn: (msg) => warnings.push(msg),
        };
    });

    describe('validateByteValue', () => {
        describe('valid inputs', () => {
            it('should accept valid integer within range (0)', () => {
                const result = validateByteValue(0, 'testParam', mockLogger);
                expect(result).to.equal(0);
                expect(warnings).to.be.empty;
            });

            it('should accept valid integer within range (255)', () => {
                const result = validateByteValue(255, 'testParam', mockLogger);
                expect(result).to.equal(255);
                expect(warnings).to.be.empty;
            });

            it('should accept valid integer within range (128)', () => {
                const result = validateByteValue(128, 'testParam', mockLogger);
                expect(result).to.equal(128);
                expect(warnings).to.be.empty;
            });

            it('should round floating point numbers down', () => {
                const result = validateByteValue(127.4, 'testParam', mockLogger);
                expect(result).to.equal(127);
                expect(warnings).to.be.empty;
            });

            it('should round floating point numbers up', () => {
                const result = validateByteValue(127.6, 'testParam', mockLogger);
                expect(result).to.equal(128);
                expect(warnings).to.be.empty;
            });

            it('should handle 0.5 rounding (rounds to even)', () => {
                const result = validateByteValue(127.5, 'testParam', mockLogger);
                expect(result).to.equal(128);
                expect(warnings).to.be.empty;
            });
        });

        describe('boundary values', () => {
            it('should reject -1 (below minimum)', () => {
                const result = validateByteValue(-1, 'testParam', mockLogger);
                expect(result).to.be.undefined;
                expect(warnings).to.have.lengthOf(1);
                expect(warnings[0]).to.include('out-of-range');
                expect(warnings[0]).to.include('testParam');
            });

            it('should reject 256 (above maximum)', () => {
                const result = validateByteValue(256, 'testParam', mockLogger);
                expect(result).to.be.undefined;
                expect(warnings).to.have.lengthOf(1);
                expect(warnings[0]).to.include('out-of-range');
                expect(warnings[0]).to.include('256');
            });

            it('should reject -100 (far below minimum)', () => {
                const result = validateByteValue(-100, 'testParam', mockLogger);
                expect(result).to.be.undefined;
                expect(warnings).to.have.lengthOf(1);
                expect(warnings[0]).to.include('out-of-range');
            });

            it('should reject 1000 (far above maximum)', () => {
                const result = validateByteValue(1000, 'testParam', mockLogger);
                expect(result).to.be.undefined;
                expect(warnings).to.have.lengthOf(1);
                expect(warnings[0]).to.include('out-of-range');
            });
        });

        describe('non-numeric inputs', () => {
            it('should reject string input', () => {
                const result = validateByteValue('123', 'testParam', mockLogger);
                expect(result).to.be.undefined;
                expect(warnings).to.have.lengthOf(1);
                expect(warnings[0]).to.include('invalid');
                expect(warnings[0]).to.include('testParam');
            });

            it('should reject null', () => {
                const result = validateByteValue(null, 'testParam', mockLogger);
                expect(result).to.be.undefined;
                expect(warnings).to.have.lengthOf(1);
                expect(warnings[0]).to.include('invalid');
            });

            it('should reject undefined', () => {
                const result = validateByteValue(undefined, 'testParam', mockLogger);
                expect(result).to.be.undefined;
                expect(warnings).to.have.lengthOf(1);
                expect(warnings[0]).to.include('invalid');
            });

            it('should reject boolean true', () => {
                const result = validateByteValue(true, 'testParam', mockLogger);
                expect(result).to.be.undefined;
                expect(warnings).to.have.lengthOf(1);
                expect(warnings[0]).to.include('invalid');
            });

            it('should reject boolean false', () => {
                const result = validateByteValue(false, 'testParam', mockLogger);
                expect(result).to.be.undefined;
                expect(warnings).to.have.lengthOf(1);
                expect(warnings[0]).to.include('invalid');
            });

            it('should reject object', () => {
                const result = validateByteValue({}, 'testParam', mockLogger);
                expect(result).to.be.undefined;
                expect(warnings).to.have.lengthOf(1);
                expect(warnings[0]).to.include('invalid');
            });

            it('should reject array', () => {
                const result = validateByteValue([123], 'testParam', mockLogger);
                expect(result).to.be.undefined;
                expect(warnings).to.have.lengthOf(1);
                expect(warnings[0]).to.include('invalid');
            });
        });

        describe('special numeric values', () => {
            it('should reject NaN', () => {
                const result = validateByteValue(NaN, 'testParam', mockLogger);
                expect(result).to.be.undefined;
                expect(warnings).to.have.lengthOf(1);
                expect(warnings[0]).to.include('invalid');
            });

            it('should reject Infinity', () => {
                const result = validateByteValue(Infinity, 'testParam', mockLogger);
                expect(result).to.be.undefined;
                expect(warnings).to.have.lengthOf(1);
                expect(warnings[0]).to.include('invalid');
            });

            it('should reject -Infinity', () => {
                const result = validateByteValue(-Infinity, 'testParam', mockLogger);
                expect(result).to.be.undefined;
                expect(warnings).to.have.lengthOf(1);
                expect(warnings[0]).to.include('invalid');
            });
        });

        describe('context parameter', () => {
            it('should include context in warning message when provided', () => {
                const result = validateByteValue(300, 'bri', mockLogger, 'addSegment');
                expect(result).to.be.undefined;
                expect(warnings).to.have.lengthOf(1);
                expect(warnings[0]).to.include('for addSegment');
                expect(warnings[0]).to.include('bri');
            });

            it('should work without context parameter', () => {
                const result = validateByteValue(300, 'bri', mockLogger);
                expect(result).to.be.undefined;
                expect(warnings).to.have.lengthOf(1);
                expect(warnings[0]).to.not.include('for');
                expect(warnings[0]).to.include('bri');
            });
        });
    });

    describe('validateSegmentColors', () => {
        describe('valid inputs', () => {
            it('should accept valid single color', () => {
                const input = [[255, 0, 128]];
                const result = validateSegmentColors(input, mockLogger);
                expect(result).to.deep.equal([[255, 0, 128]]);
                expect(warnings).to.be.empty;
            });

            it('should accept multiple valid colors', () => {
                const input = [
                    [255, 0, 0],
                    [0, 255, 0],
                    [0, 0, 255],
                ];
                const result = validateSegmentColors(input, mockLogger);
                expect(result).to.deep.equal(input);
                expect(warnings).to.be.empty;
            });

            it('should accept boundary values (0, 0, 0)', () => {
                const input = [[0, 0, 0]];
                const result = validateSegmentColors(input, mockLogger);
                expect(result).to.deep.equal([[0, 0, 0]]);
                expect(warnings).to.be.empty;
            });

            it('should accept boundary values (255, 255, 255)', () => {
                const input = [[255, 255, 255]];
                const result = validateSegmentColors(input, mockLogger);
                expect(result).to.deep.equal([[255, 255, 255]]);
                expect(warnings).to.be.empty;
            });

            it('should round floating point color values', () => {
                const input = [[127.4, 127.6, 128.5]];
                const result = validateSegmentColors(input, mockLogger);
                expect(result).to.deep.equal([[127, 128, 129]]);
                expect(warnings).to.be.empty;
            });

            it('should accept colors with more than 3 channels (uses first 3)', () => {
                const input = [[255, 128, 64, 32]];
                const result = validateSegmentColors(input, mockLogger);
                expect(result).to.deep.equal([[255, 128, 64]]);
                expect(warnings).to.be.empty;
            });
        });

        describe('invalid color array structure', () => {
            it('should reject non-array input', () => {
                const result = validateSegmentColors('not an array', mockLogger);
                expect(result).to.be.null;
                expect(warnings).to.have.lengthOf(1);
                expect(warnings[0]).to.include('expected array');
            });

            it('should reject null', () => {
                const result = validateSegmentColors(null, mockLogger);
                expect(result).to.be.null;
                expect(warnings).to.have.lengthOf(1);
                expect(warnings[0]).to.include('expected array');
            });

            it('should reject undefined', () => {
                const result = validateSegmentColors(undefined, mockLogger);
                expect(result).to.be.null;
                expect(warnings).to.have.lengthOf(1);
                expect(warnings[0]).to.include('expected array');
            });

            it('should reject object', () => {
                const result = validateSegmentColors({}, mockLogger);
                expect(result).to.be.null;
                expect(warnings).to.have.lengthOf(1);
                expect(warnings[0]).to.include('expected array');
            });

            it('should reject number', () => {
                const result = validateSegmentColors(123, mockLogger);
                expect(result).to.be.null;
                expect(warnings).to.have.lengthOf(1);
                expect(warnings[0]).to.include('expected array');
            });
        });

        describe('invalid color entries', () => {
            it('should skip non-array color entry', () => {
                const input = [[255, 0, 0], 'invalid', [0, 255, 0]];
                const result = validateSegmentColors(input, mockLogger);
                expect(result).to.deep.equal([
                    [255, 0, 0],
                    [0, 255, 0],
                ]);
                expect(warnings).to.have.lengthOf(1);
                expect(warnings[0]).to.include('index 1');
            });

            it('should skip color array with less than 3 values', () => {
                const input = [[255, 0, 0], [128, 64], [0, 255, 0]];
                const result = validateSegmentColors(input, mockLogger);
                expect(result).to.deep.equal([
                    [255, 0, 0],
                    [0, 255, 0],
                ]);
                expect(warnings).to.have.lengthOf(1);
                expect(warnings[0]).to.include('index 1');
            });

            it('should skip empty color array', () => {
                const input = [[255, 0, 0], [], [0, 255, 0]];
                const result = validateSegmentColors(input, mockLogger);
                expect(result).to.deep.equal([
                    [255, 0, 0],
                    [0, 255, 0],
                ]);
                expect(warnings).to.have.lengthOf(1);
            });

            it('should return null when all entries are invalid', () => {
                const input = ['invalid', [1, 2], {}];
                const result = validateSegmentColors(input, mockLogger);
                expect(result).to.be.null;
                expect(warnings.length).to.be.greaterThan(0);
                expect(warnings[warnings.length - 1]).to.include('no valid color entries');
            });
        });

        describe('invalid color channel values', () => {
            it('should skip color with non-numeric channel', () => {
                const input = [
                    [255, 0, 0],
                    [128, 'invalid', 64],
                    [0, 255, 0],
                ];
                const result = validateSegmentColors(input, mockLogger);
                expect(result).to.deep.equal([
                    [255, 0, 0],
                    [0, 255, 0],
                ]);
                expect(warnings).to.have.lengthOf(1);
                expect(warnings[0]).to.include('col[1][1]');
                expect(warnings[0]).to.include('invalid');
            });

            it('should skip color with NaN channel', () => {
                const input = [
                    [255, 0, 0],
                    [NaN, 128, 64],
                    [0, 255, 0],
                ];
                const result = validateSegmentColors(input, mockLogger);
                expect(result).to.deep.equal([
                    [255, 0, 0],
                    [0, 255, 0],
                ]);
                expect(warnings).to.have.lengthOf(1);
            });

            it('should skip color with Infinity channel', () => {
                const input = [
                    [255, 0, 0],
                    [Infinity, 128, 64],
                    [0, 255, 0],
                ];
                const result = validateSegmentColors(input, mockLogger);
                expect(result).to.deep.equal([
                    [255, 0, 0],
                    [0, 255, 0],
                ]);
                expect(warnings).to.have.lengthOf(1);
            });

            it('should skip color with negative channel value', () => {
                const input = [
                    [255, 0, 0],
                    [-1, 128, 64],
                    [0, 255, 0],
                ];
                const result = validateSegmentColors(input, mockLogger);
                expect(result).to.deep.equal([
                    [255, 0, 0],
                    [0, 255, 0],
                ]);
                expect(warnings).to.have.lengthOf(1);
                expect(warnings[0]).to.include('out-of-range');
            });

            it('should skip color with channel value > 255', () => {
                const input = [
                    [255, 0, 0],
                    [256, 128, 64],
                    [0, 255, 0],
                ];
                const result = validateSegmentColors(input, mockLogger);
                expect(result).to.deep.equal([
                    [255, 0, 0],
                    [0, 255, 0],
                ]);
                expect(warnings).to.have.lengthOf(1);
                expect(warnings[0]).to.include('out-of-range');
            });

            it('should skip color if any channel is invalid', () => {
                const input = [
                    [255, 0, 0],
                    [128, 256, 64],
                    [0, 255, 0],
                ];
                const result = validateSegmentColors(input, mockLogger);
                expect(result).to.deep.equal([
                    [255, 0, 0],
                    [0, 255, 0],
                ]);
                expect(warnings).to.have.lengthOf(1);
            });
        });

        describe('empty and edge cases', () => {
            it('should return null for empty array', () => {
                const result = validateSegmentColors([], mockLogger);
                expect(result).to.be.null;
                expect(warnings).to.have.lengthOf(1);
                expect(warnings[0]).to.include('no valid color entries');
            });

            it('should handle array with only invalid entries', () => {
                const input = [null, undefined, 'invalid', 123];
                const result = validateSegmentColors(input, mockLogger);
                expect(result).to.be.null;
                expect(warnings.length).to.be.greaterThan(0);
            });
        });

        describe('context parameter', () => {
            it('should include context in warning messages when provided', () => {
                const input = 'not an array';
                const result = validateSegmentColors(input, mockLogger, 'addSegment');
                expect(result).to.be.null;
                expect(warnings).to.have.lengthOf(1);
                expect(warnings[0]).to.include('for addSegment');
            });

            it('should work without context parameter', () => {
                const input = 'not an array';
                const result = validateSegmentColors(input, mockLogger);
                expect(result).to.be.null;
                expect(warnings).to.have.lengthOf(1);
                expect(warnings[0]).to.not.include('for');
            });

            it('should include context when skipping invalid color entry', () => {
                const input = [[255, 0, 0], 'invalid'];
                const result = validateSegmentColors(input, mockLogger, 'testContext');
                expect(result).to.deep.equal([[255, 0, 0]]);
                expect(warnings).to.have.lengthOf(1);
                expect(warnings[0]).to.include('for testContext');
            });
        });
    });
});
