const path = require('path');
const { tests } = require('@iobroker/testing');

// Run unit tests - See https://github.com/ioBroker/testing for a detailed explanation and further options
tests.unit(path.join(__dirname, ".."),{
    defineMockBehavior(db, adapter) {
        adapter.getDevicesAsync.returns([
            {
              "from": "system.adapter.wled.0",
              "user": "system.user.admin",
              "ts": 1584734463218,
              "common": {
                "name": "Wookamer"
              },
              "native": {
                "ip": "192.168.10.94",
                "mac": "cc50e35b8323",
                "name": "Wookamer"
              },
              "acl": {
                "object": 1636,
                "owner": "system.user.admin",
                "ownerGroup": "system.group.administrator"
              },
              "_id": "wled.0.cc50e35b832b",
              "type": "device"
            },
            {
              "type": "device",
              "common": {
                "name": "WLED"
              },
              "native": {
                "ip": "192.168.10.39",
                "mac": "840d8e8a7eb3",
                "name": "WLED"
              },
              "from": "system.adapter.wled.0",
              "user": "system.user.admin",
              "ts": 1584739064300,
              "_id": "wled.0.840d8e8a7eb3",
              "acl": {
                "object": 1636,
                "owner": "system.user.admin",
                "ownerGroup": "system.group.administrator"
              }
            }
          ]);
    }
});