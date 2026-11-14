import React from 'react';
import { ConfigGeneric, type ConfigGenericProps, type ConfigGenericState } from '@iobroker/json-config';

import DevicesApp from './DevicesApp';

/** Custom jsonConfig component of the tab "Geräte" (#266) */
export default class DevicesOverview extends ConfigGeneric<ConfigGenericProps, ConfigGenericState> {
    renderItem(): React.JSX.Element {
        return (
            <DevicesApp
                api={{
                    socket: this.props.oContext.socket,
                    instance: this.props.oContext.instance,
                    adapterName: this.props.oContext.adapterName,
                    themeType: this.props.oContext.themeType,
                }}
            />
        );
    }
}
