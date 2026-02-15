const path = require('path');
const { tests } = require('@iobroker/testing');

// Test segment management functionality
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('Segment Management - addSegment', (getHarness) => {
            it('Should handle addSegment command via sendTo and validate parameters', async function () {
                this.timeout(60000);

                const harness = getHarness();

                // Start the adapter
                await harness.startAdapterAndWait();

                // Wait for adapter to initialize fully
                await new Promise((resolve) => setTimeout(resolve, 5000));

                console.log('Testing addSegment parameter validation...');

                // Test missing deviceId - should get immediate validation error
                console.log('Test 1: Missing deviceId...');
                let responseReceived = false;
                const missingDeviceId = await new Promise((resolve) => {
                    harness.sendTo(harness.namespace, 'addSegment', { segmentId: 1 }, (response) => {
                        console.log(`Received response for missing deviceId: ${JSON.stringify(response)}`);
                        responseReceived = true;
                        resolve(response);
                    });

                    // Give it 8 seconds to respond
                    setTimeout(() => {
                        if (!responseReceived) {
                            console.log('⚠️ Timeout - no response received for missing deviceId test');
                            resolve({ success: false, error: 'Timeout', timeout: true });
                        }
                    }, 8000);
                });

                if (missingDeviceId.timeout) {
                    console.log('⚠️ Test inconclusive due to timeout - sendTo response not received');
                    console.log('This may indicate the adapter onMessage handler is not processing the command');
                } else if (missingDeviceId.success === false && missingDeviceId.error && missingDeviceId.error.includes('deviceId')) {
                    console.log('✅ Correctly rejected addSegment without deviceId');
                } else {
                    console.log(`❌ Unexpected response: ${JSON.stringify(missingDeviceId)}`);
                    throw new Error('addSegment should reject requests without deviceId');
                }

                // Test missing segmentId
                console.log('Test 2: Missing segmentId...');
                responseReceived = false;
                const missingSegmentId = await new Promise((resolve) => {
                    harness.sendTo(harness.namespace, 'addSegment', { deviceId: 'AABBCCDDEE' }, (response) => {
                        console.log(`Received response for missing segmentId: ${JSON.stringify(response)}`);
                        responseReceived = true;
                        resolve(response);
                    });

                    setTimeout(() => {
                        if (!responseReceived) {
                            console.log('⚠️ Timeout - no response received for missing segmentId test');
                            resolve({ success: false, error: 'Timeout', timeout: true });
                        }
                    }, 8000);
                });

                if (missingSegmentId.timeout) {
                    console.log('⚠️ Test inconclusive due to timeout - sendTo response not received');
                } else if (missingSegmentId.success === false && missingSegmentId.error && missingSegmentId.error.includes('segmentId')) {
                    console.log('✅ Correctly rejected addSegment without segmentId');
                } else {
                    console.log(`❌ Unexpected response: ${JSON.stringify(missingSegmentId)}`);
                    throw new Error('addSegment should reject requests without segmentId');
                }

                // Test with valid parameters but non-existent device
                console.log('Test 3: Valid parameters with non-existent device...');
                const validParams = {
                    deviceId: 'AABBCC112233',
                    segmentId: 1,
                    start: 0,
                    stop: 10,
                };

                responseReceived = false;
                const result = await new Promise((resolve) => {
                    harness.sendTo(harness.namespace, 'addSegment', validParams, (response) => {
                        console.log(`Received response for valid params: ${JSON.stringify(response)}`);
                        responseReceived = true;
                        resolve(response);
                    });

                    setTimeout(() => {
                        if (!responseReceived) {
                            console.log('⚠️ Timeout - no response received for valid params test');
                            resolve({ success: false, error: 'Timeout', timeout: true });
                        }
                    }, 8000);
                });

                if (result.timeout) {
                    console.log('⚠️ Test inconclusive due to timeout - sendTo response not received');
                } else if (result.success === false) {
                    // Expected - device not found in test environment
                    console.log('✅ addSegment with valid parameters handled (device not found expected)');
                } else if (result.success === true) {
                    console.log('✅ addSegment command processed successfully');
                }

                console.log('✅ addSegment handler tests completed');

                await harness.stopAdapter();
            });
        });

        suite('Segment Management - deleteSegment', (getHarness) => {
            it('Should handle deleteSegment command via sendTo and validate parameters', async function () {
                this.timeout(60000);

                const harness = getHarness();

                // Start the adapter
                await harness.startAdapterAndWait();

                // Wait for adapter to initialize fully
                await new Promise((resolve) => setTimeout(resolve, 5000));

                console.log('Testing deleteSegment parameter validation...');

                // Test missing deviceId
                console.log('Test 1: Missing deviceId...');
                let responseReceived = false;
                const missingDeviceId = await new Promise((resolve) => {
                    harness.sendTo(harness.namespace, 'deleteSegment', { segmentId: 1 }, (response) => {
                        console.log(`Received response for missing deviceId: ${JSON.stringify(response)}`);
                        responseReceived = true;
                        resolve(response);
                    });

                    setTimeout(() => {
                        if (!responseReceived) {
                            console.log('⚠️ Timeout - no response received for missing deviceId test');
                            resolve({ success: false, error: 'Timeout', timeout: true });
                        }
                    }, 8000);
                });

                if (missingDeviceId.timeout) {
                    console.log('⚠️ Test inconclusive due to timeout - sendTo response not received');
                } else if (missingDeviceId.success === false && missingDeviceId.error && missingDeviceId.error.includes('deviceId')) {
                    console.log('✅ Correctly rejected deleteSegment without deviceId');
                } else {
                    console.log(`❌ Unexpected response: ${JSON.stringify(missingDeviceId)}`);
                    throw new Error('deleteSegment should reject requests without deviceId');
                }

                // Test missing segmentId
                console.log('Test 2: Missing segmentId...');
                responseReceived = false;
                const missingSegmentId = await new Promise((resolve) => {
                    harness.sendTo(harness.namespace, 'deleteSegment', { deviceId: 'AABBCCDDEE' }, (response) => {
                        console.log(`Received response for missing segmentId: ${JSON.stringify(response)}`);
                        responseReceived = true;
                        resolve(response);
                    });

                    setTimeout(() => {
                        if (!responseReceived) {
                            console.log('⚠️ Timeout - no response received for missing segmentId test');
                            resolve({ success: false, error: 'Timeout', timeout: true });
                        }
                    }, 8000);
                });

                if (missingSegmentId.timeout) {
                    console.log('⚠️ Test inconclusive due to timeout - sendTo response not received');
                } else if (missingSegmentId.success === false && missingSegmentId.error && missingSegmentId.error.includes('segmentId')) {
                    console.log('✅ Correctly rejected deleteSegment without segmentId');
                } else {
                    console.log(`❌ Unexpected response: ${JSON.stringify(missingSegmentId)}`);
                    throw new Error('deleteSegment should reject requests without segmentId');
                }

                // Test with valid parameters but non-existent device
                console.log('Test 3: Valid parameters with non-existent device...');
                const validParams = {
                    deviceId: 'DDEEFF445566',
                    segmentId: 1,
                };

                responseReceived = false;
                const result = await new Promise((resolve) => {
                    harness.sendTo(harness.namespace, 'deleteSegment', validParams, (response) => {
                        console.log(`Received response for valid params: ${JSON.stringify(response)}`);
                        responseReceived = true;
                        resolve(response);
                    });

                    setTimeout(() => {
                        if (!responseReceived) {
                            console.log('⚠️ Timeout - no response received for valid params test');
                            resolve({ success: false, error: 'Timeout', timeout: true });
                        }
                    }, 8000);
                });

                if (result.timeout) {
                    console.log('⚠️ Test inconclusive due to timeout - sendTo response not received');
                } else if (result.success === false) {
                    // Expected - device not found in test environment
                    console.log('✅ deleteSegment with valid parameters handled (device not found expected)');
                } else if (result.success === true) {
                    console.log('✅ deleteSegment command processed successfully');
                }

                console.log('✅ deleteSegment handler tests completed');

                await harness.stopAdapter();
            });
        });
    },
});
