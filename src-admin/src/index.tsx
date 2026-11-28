// Preview of the custom component with simulated data (npm start). Not part of the build for the admin.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Box, CssBaseline, Tab, Tabs, ThemeProvider, createTheme } from '@mui/material';
import { I18n } from '@iobroker/gui-components';

import DevicesApp from './DevicesApp';
import { createMockSocket } from './mock';
import de from './i18n/de.json';
import en from './i18n/en.json';

const params = new URLSearchParams(window.location.search);
const mode = params.get('theme') === 'dark' ? 'dark' : 'light';
I18n.extendTranslations(de, 'de');
I18n.extendTranslations(en, 'en');
I18n.setLanguage((params.get('lang') as ioBroker.Languages) || 'de');

function Preview(): React.JSX.Element {
    const theme = createTheme({ palette: { mode, primary: { main: mode === 'dark' ? '#6cb4ee' : '#1f6fa8' } } });
    const api = {
        socket: createMockSocket({
            alive: params.get('alive') !== 'false',
            empty: params.get('empty') === 'true',
        }) as any,
        instance: 0,
        adapterName: 'wled',
        themeType: mode,
    };
    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <Box sx={{ bgcolor: mode === 'dark' ? '#121212' : '#eef0f3', minHeight: '100vh' }}>
                <Tabs
                    value={0}
                    sx={{ bgcolor: 'background.paper' }}
                >
                    <Tab label={I18n.getLanguage() === 'en' ? 'Devices' : 'Geräte'} />
                    <Tab label={I18n.getLanguage() === 'en' ? 'Settings' : 'Einstellungen'} />
                </Tabs>
                <DevicesApp api={api} />
            </Box>
        </ThemeProvider>
    );
}

const container = document.getElementById('root');
if (container) {
    createRoot(container).render(<Preview />);
}
