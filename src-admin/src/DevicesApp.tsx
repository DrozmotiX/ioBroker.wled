import React, { useCallback, useEffect, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Collapse,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    IconButton,
    Link,
    Skeleton,
    Snackbar,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import { Add, CloudOff, Delete, Lightbulb, OpenInNew, PlayArrow, PowerOff, Refresh, Search } from '@mui/icons-material';

import { checkHost, formatMac, send, t, type ActionAnswer, type Api, type Device, type DevicesAnswer } from './api';
import { Card, DeviceAvatar, OnlineChip, tabular } from './ui';

export interface DevicesAppProps {
    api: Api;
}

type Notice = { severity: 'success' | 'error' | 'info'; text: string } | null;

function useAlive(api: Api): boolean | null {
    const [alive, setAlive] = useState<boolean | null>(null);
    useEffect(() => {
        const id = `system.adapter.${api.adapterName}.${api.instance}.alive`;
        const handler = (_id: string, state: ioBroker.State | null | undefined): void => setAlive(!!state?.val);
        void api.socket.getState(id).then(state => setAlive(!!state?.val));
        void api.socket.subscribeState(id, handler);
        return () => api.socket.unsubscribeState(id, handler);
    }, [api]);
    return alive;
}

function useDevices(
    api: Api,
    alive: boolean | null,
): { devices: Device[] | null; error: string; reload: () => Promise<void> } {
    const [devices, setDevices] = useState<Device[] | null>(null);
    const [error, setError] = useState('');
    const reload = useCallback(async () => {
        try {
            const result = await send<DevicesAnswer>(api, 'getDevices');
            if (!result?.ok) {
                throw new Error(result?.error || 'no answer');
            }
            setDevices(result.devices || []);
            setError('');
        } catch (e) {
            setError(String(e));
        }
    }, [api]);
    useEffect(() => {
        if (!alive) {
            return;
        }
        void reload();
        // Live status while the page is open
        const timer = setInterval(() => void reload(), 10_000);
        return () => clearInterval(timer);
    }, [alive, reload]);
    return { devices, error, reload };
}

function NotAliveBanner(props: { api: Api }): React.JSX.Element {
    return (
        <Alert
            severity="error"
            icon={<PowerOff />}
            sx={{ mb: 2 }}
            action={
                <Button
                    variant="contained"
                    color="error"
                    size="small"
                    startIcon={<PlayArrow />}
                    onClick={() =>
                        void props.api.socket.extendObject(
                            `system.adapter.${props.api.adapterName}.${props.api.instance}`,
                            { common: { enabled: true } },
                        )
                    }
                >
                    {t('wl_start')}
                </Button>
            }
        >
            <Typography sx={{ fontWeight: 500 }}>{t('wl_notRunning')}</Typography>
            {t('wl_notRunningText')}
        </Alert>
    );
}

function Fact(props: { label: string; value: React.ReactNode }): React.JSX.Element {
    return (
        <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{props.label}</Typography>
            <Typography
                sx={{
                    fontSize: 14,
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    ...tabular,
                }}
            >
                {props.value ?? '–'}
            </Typography>
        </Box>
    );
}

function DeviceCard(props: { device: Device; onDelete: () => void }): React.JSX.Element {
    const { device } = props;
    const light =
        !device.online || device.on === null
            ? t('wl_unknown')
            : device.on
              ? device.bri !== null
                  ? t('wl_onBri', Math.round((device.bri / 255) * 100))
                  : t('wl_on')
              : t('wl_off');
    return (
        <Card sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                <DeviceAvatar
                    on={device.on}
                    online={device.online}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                        sx={{
                            fontSize: 16,
                            fontWeight: 500,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {device.name}
                    </Typography>
                    <Typography sx={{ fontSize: 13, color: 'text.secondary', ...tabular }}>
                        {formatMac(device.id)}
                    </Typography>
                </Box>
                <OnlineChip online={device.online} />
            </Box>
            <Divider />
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1 }}>
                <Fact
                    label={t('wl_ip')}
                    value={device.ip}
                />
                <Fact
                    label={t('wl_firmware')}
                    value={device.version}
                />
                <Fact
                    label={t('wl_leds')}
                    value={device.leds}
                />
                <Fact
                    label={t('wl_light')}
                    value={light}
                />
                <Fact
                    label={t('wl_connection')}
                    value={device.online && device.connection ? t(`wl_conn_${device.connection}`) : '–'}
                />
                <Fact
                    label={t('wl_chip')}
                    value={device.arch}
                />
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {device.ip ? (
                    <Button
                        size="small"
                        startIcon={<OpenInNew />}
                        href={`http://${device.ip}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        disabled={!device.online}
                    >
                        {t('wl_openWled')}
                    </Button>
                ) : null}
                <Box sx={{ flex: 1 }} />
                <Tooltip title={t('wl_delete')}>
                    <IconButton
                        aria-label={t('wl_delete')}
                        onClick={props.onDelete}
                        size="small"
                    >
                        <Delete fontSize="small" />
                    </IconButton>
                </Tooltip>
            </Box>
        </Card>
    );
}

function AddDialog(props: { api: Api; onClose: (added: boolean, text?: string) => void }): React.JSX.Element {
    const [ip, setIp] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const local = checkHost(ip);
    const submit = async (): Promise<void> => {
        if (local !== 'ok') {
            setError(t(`wl_err_${local}`));
            return;
        }
        setBusy(true);
        setError('');
        try {
            const result = await send<ActionAnswer>(props.api, 'addDevice', { ip });
            if (result?.ok) {
                props.onClose(true, t('wl_added', result.host || ip));
                return;
            }
            setError(t(`wl_err_${result?.error || 'internal'}`, result?.host || ip));
        } catch (e) {
            setError(String(e));
        } finally {
            setBusy(false);
        }
    };
    return (
        <Dialog
            open
            onClose={() => !busy && props.onClose(false)}
            fullWidth
            maxWidth="xs"
        >
            <DialogTitle>{t('wl_addTitle')}</DialogTitle>
            <DialogContent>
                <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mb: 2 }}
                >
                    {t('wl_addText')}
                </Typography>
                <TextField
                    autoFocus
                    fullWidth
                    label={t('wl_ipOrHost')}
                    placeholder="192.168.0.50"
                    value={ip}
                    disabled={busy}
                    error={!!error}
                    helperText={error || ' '}
                    onChange={e => {
                        setIp(e.target.value);
                        setError('');
                    }}
                    onKeyDown={e => {
                        if (e.key === 'Enter') {
                            void submit();
                        }
                    }}
                    slotProps={{ htmlInput: { 'data-testid': 'add-ip' } }}
                />
            </DialogContent>
            <DialogActions>
                <Button
                    onClick={() => props.onClose(false)}
                    disabled={busy}
                >
                    {t('wl_cancel')}
                </Button>
                <Button
                    variant="contained"
                    onClick={() => void submit()}
                    disabled={busy || !ip.trim()}
                    startIcon={busy ? <CircularProgress size={16} /> : <Add />}
                >
                    {t('wl_add')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

function DeleteDialog(props: {
    api: Api;
    device: Device;
    onClose: (deleted: boolean, text?: string) => void;
}): React.JSX.Element {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const submit = async (): Promise<void> => {
        setBusy(true);
        try {
            const result = await send<ActionAnswer>(props.api, 'deleteDevice', { id: props.device.id });
            if (result?.ok) {
                props.onClose(true, t('wl_deleted', props.device.name));
                return;
            }
            setError(t(`wl_err_${result?.error || 'internal'}`, props.device.name));
        } catch (e) {
            setError(String(e));
        } finally {
            setBusy(false);
        }
    };
    return (
        <Dialog
            open
            onClose={() => !busy && props.onClose(false)}
            fullWidth
            maxWidth="xs"
        >
            <DialogTitle>{t('wl_deleteTitle', props.device.name)}</DialogTitle>
            <DialogContent>
                <Typography>{t('wl_deleteText')}</Typography>
                <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 1 }}
                >
                    {t('wl_deleteHint')}
                </Typography>
                {error ? (
                    <Alert
                        severity="error"
                        sx={{ mt: 2 }}
                    >
                        {error}
                    </Alert>
                ) : null}
            </DialogContent>
            <DialogActions>
                <Button
                    onClick={() => props.onClose(false)}
                    disabled={busy}
                >
                    {t('wl_cancel')}
                </Button>
                <Button
                    variant="contained"
                    color="error"
                    onClick={() => void submit()}
                    disabled={busy}
                    startIcon={busy ? <CircularProgress size={16} /> : <Delete />}
                >
                    {t('wl_deleteButton')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

function EmptyState(props: { onAdd: () => void; onSearch: () => void; searching: boolean }): React.JSX.Element {
    return (
        <Card sx={{ maxWidth: 560, mx: 'auto', textAlign: 'center', p: 4 }}>
            <Lightbulb sx={{ fontSize: 48, color: 'text.secondary' }} />
            <Typography sx={{ fontSize: 20, fontWeight: 500, mb: 1 }}>{t('wl_emptyTitle')}</Typography>
            <Typography color="text.secondary">{t('wl_emptyText')}</Typography>
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', mt: 2, flexWrap: 'wrap' }}>
                <Button
                    variant="contained"
                    startIcon={props.searching ? <CircularProgress size={16} /> : <Search />}
                    onClick={props.onSearch}
                    disabled={props.searching}
                >
                    {t(props.searching ? 'wl_searching' : 'wl_search')}
                </Button>
                <Button
                    variant="outlined"
                    startIcon={<Add />}
                    onClick={props.onAdd}
                >
                    {t('wl_addDevice')}
                </Button>
            </Box>
        </Card>
    );
}

function ErrorState(props: { error: string; onRetry: () => void }): React.JSX.Element {
    const [open, setOpen] = useState(false);
    return (
        <Card sx={{ maxWidth: 560, mx: 'auto', textAlign: 'center', p: 4 }}>
            <CloudOff sx={{ fontSize: 48, color: 'text.secondary' }} />
            <Typography sx={{ fontSize: 18, fontWeight: 500 }}>{t('wl_loadFailed')}</Typography>
            <Typography color="text.secondary">{t('wl_loadFailedText')}</Typography>
            <Button
                variant="contained"
                startIcon={<Refresh />}
                sx={{ mt: 2 }}
                onClick={props.onRetry}
            >
                {t('wl_retry')}
            </Button>
            <Box>
                <Button
                    size="small"
                    onClick={() => setOpen(!open)}
                    sx={{ mt: 1 }}
                >
                    {t('wl_forExperts')}
                </Button>
                <Collapse in={open}>
                    <Typography
                        variant="body2"
                        sx={{ fontFamily: 'monospace' }}
                    >
                        {props.error}
                    </Typography>
                </Collapse>
            </Box>
        </Card>
    );
}

const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 2 } as const;

export default function DevicesApp(props: DevicesAppProps): React.JSX.Element {
    const { api } = props;
    const alive = useAlive(api);
    const { devices, error, reload } = useDevices(api, alive);
    const [adding, setAdding] = useState(false);
    const [deleting, setDeleting] = useState<Device | null>(null);
    const [searching, setSearching] = useState(false);
    const [notice, setNotice] = useState<Notice>(null);

    const search = async (): Promise<void> => {
        setSearching(true);
        try {
            const result = await send<ActionAnswer>(api, 'discover', {});
            if (!result?.ok) {
                setNotice({ severity: 'error', text: t('wl_err_internal') });
            } else if (result.found) {
                setNotice({ severity: 'success', text: t('wl_foundNew', result.found) });
            } else {
                setNotice({ severity: 'info', text: t('wl_foundNone') });
            }
            await reload();
        } catch (e) {
            setNotice({ severity: 'error', text: String(e) });
        } finally {
            setSearching(false);
        }
    };

    const online = devices ? devices.filter(d => d.online).length : 0;

    return (
        <Box sx={{ p: { xs: 1, sm: 2 }, width: '100%' }}>
            {alive === false ? <NotAliveBanner api={api} /> : null}

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                <Box sx={{ flex: 1, minWidth: 200 }}>
                    <Typography sx={{ fontSize: 20, fontWeight: 500 }}>{t('wl_devices')}</Typography>
                    <Typography sx={{ fontSize: 13, color: 'text.secondary', ...tabular }}>
                        {devices && devices.length ? t('wl_countOnline', online, devices.length) : t('wl_subtitle')}
                    </Typography>
                </Box>
                <Button
                    variant="outlined"
                    startIcon={searching ? <CircularProgress size={16} /> : <Search />}
                    onClick={() => void search()}
                    disabled={!alive || searching}
                >
                    {t(searching ? 'wl_searching' : 'wl_search')}
                </Button>
                <Button
                    variant="contained"
                    startIcon={<Add />}
                    onClick={() => setAdding(true)}
                    disabled={!alive}
                >
                    {t('wl_addDevice')}
                </Button>
            </Box>

            {alive === false ? null : error && !devices ? (
                <ErrorState
                    error={error}
                    onRetry={() => void reload()}
                />
            ) : devices === null ? (
                <Box sx={grid}>
                    {[0, 1, 2].map(index => (
                        <Skeleton
                            key={index}
                            variant="rounded"
                            height={190}
                        />
                    ))}
                </Box>
            ) : devices.length === 0 ? (
                <EmptyState
                    onAdd={() => setAdding(true)}
                    onSearch={() => void search()}
                    searching={searching}
                />
            ) : (
                <Box sx={grid}>
                    {devices.map(device => (
                        <DeviceCard
                            key={device.id}
                            device={device}
                            onDelete={() => setDeleting(device)}
                        />
                    ))}
                </Box>
            )}

            <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 2 }}>
                {t('wl_hint')}{' '}
                <Link
                    href="https://github.com/DrozmotiX/ioBroker.wled/tree/main/docs/de"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    {t('wl_docs')}
                </Link>
            </Typography>

            {adding ? (
                <AddDialog
                    api={api}
                    onClose={(added, text) => {
                        setAdding(false);
                        if (added) {
                            setNotice({ severity: 'success', text: text || '' });
                            void reload();
                        }
                    }}
                />
            ) : null}
            {deleting ? (
                <DeleteDialog
                    api={api}
                    device={deleting}
                    onClose={(deleted, text) => {
                        setDeleting(null);
                        if (deleted) {
                            setNotice({ severity: 'success', text: text || '' });
                            void reload();
                        }
                    }}
                />
            ) : null}
            <Snackbar
                open={!!notice}
                autoHideDuration={5000}
                onClose={() => setNotice(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                {notice ? (
                    <Alert
                        severity={notice.severity}
                        onClose={() => setNotice(null)}
                        variant="filled"
                    >
                        {notice.text}
                    </Alert>
                ) : undefined}
            </Snackbar>
        </Box>
    );
}
