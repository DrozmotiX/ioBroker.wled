import React from 'react';
import { Box, Chip, Paper, type SxProps, type Theme } from '@mui/material';
import { CheckCircle, CloudOff, Lightbulb, LightbulbOutlined } from '@mui/icons-material';

import { t } from './api';

export function DeviceAvatar(props: { on: boolean | null; online: boolean; size?: number }): React.JSX.Element {
    const size = props.size || 40;
    const lit = props.online && props.on === true;
    const Icon = lit ? Lightbulb : LightbulbOutlined;
    return (
        <Box
            sx={{
                width: size,
                height: size,
                borderRadius: '50%',
                flex: `0 0 ${size}px`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: theme =>
                    lit
                        ? theme.palette.mode === 'dark'
                            ? 'rgba(255,183,77,.18)'
                            : 'rgba(245,124,0,.12)'
                        : theme.palette.mode === 'dark'
                          ? 'rgba(108,180,238,.16)'
                          : 'rgba(31,111,168,.10)',
                color: lit ? 'warning.main' : props.online ? 'primary.main' : 'text.disabled',
            }}
        >
            <Icon sx={{ fontSize: size * 0.55 }} />
        </Box>
    );
}

/**
 * Status never only by colour: always icon and text
 *
 * @param props
 * @param props.online
 */
export function OnlineChip(props: { online: boolean }): React.JSX.Element {
    return (
        <Chip
            size="small"
            variant="outlined"
            color={props.online ? 'success' : 'error'}
            icon={props.online ? <CheckCircle /> : <CloudOff />}
            label={t(props.online ? 'wl_online' : 'wl_offline')}
            sx={{ height: 24, borderRadius: '12px', fontWeight: 500 }}
        />
    );
}

export function Card(props: { children: React.ReactNode; sx?: SxProps<Theme> }): React.JSX.Element {
    return (
        <Paper
            elevation={1}
            sx={{ p: 2, borderRadius: 1, ...(props.sx || {}) }}
        >
            {props.children}
        </Paper>
    );
}

export const tabular: SxProps<Theme> = { fontVariantNumeric: 'tabular-nums' };
