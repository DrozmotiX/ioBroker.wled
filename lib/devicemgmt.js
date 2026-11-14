const dmUtils = require('@jey-cee/dm-utils');

/**
 * Form to edit a device in the Device Manager
 *
 * @param {string} wledName name of the device in WLED
 * @returns {object} JSON config schema of the form
 */
function editDeviceForm(wledName) {
    return {
        type: 'panel',
        items: {
            newName: {
                type: 'text',
                trim: false,
                label: {
                    en: 'Name in ioBroker',
                    de: 'Name in ioBroker',
                    ru: 'Имя в ioBroker',
                    pt: 'Nome no ioBroker',
                    nl: 'Naam in ioBroker',
                    fr: 'Nom dans ioBroker',
                    it: 'Nome in ioBroker',
                    es: 'Nombre en ioBroker',
                    pl: 'Nazwa w ioBroker',
                    'zh-cn': 'ioBroker 中的名称',
                    uk: "Ім'я в ioBroker",
                },
                hidden: 'data.syncName === true',
            },
            syncName: {
                type: 'checkbox',
                newLine: true,
                disabled: wledName ? 'false' : 'true',
                label: {
                    en: `Take over the name from WLED (${wledName})`,
                    de: `Name von WLED übernehmen (${wledName})`,
                    ru: `Взять имя из WLED (${wledName})`,
                    pt: `Usar o nome do WLED (${wledName})`,
                    nl: `Naam van WLED overnemen (${wledName})`,
                    fr: `Reprendre le nom de WLED (${wledName})`,
                    it: `Usa il nome di WLED (${wledName})`,
                    es: `Usar el nombre de WLED (${wledName})`,
                    pl: `Przejmij nazwę z WLED (${wledName})`,
                    'zh-cn': `使用 WLED 中的名称 (${wledName})`,
                    uk: `Взяти ім'я з WLED (${wledName})`,
                },
            },
            note: {
                type: 'staticText',
                text: {
                    en: 'The name of the device in WLED itself is not changed. A name taken over from WLED follows later renames in WLED, a name set here stays.',
                    de: 'Der Name im WLED-Gerät selbst wird nicht geändert. Ein von WLED übernommener Name folgt späteren Umbenennungen in WLED, ein hier gesetzter Name bleibt.',
                    ru: 'Имя в самом устройстве WLED не меняется. Имя, взятое из WLED, следует за последующими переименованиями в WLED, имя, заданное здесь, сохраняется.',
                    pt: 'O nome no próprio dispositivo WLED não é alterado. Um nome usado do WLED acompanha renomeações posteriores no WLED, um nome definido aqui é mantido.',
                    nl: 'De naam in het WLED-apparaat zelf wordt niet gewijzigd. Een van WLED overgenomen naam volgt latere hernoemingen in WLED, een hier ingestelde naam blijft.',
                    fr: "Le nom dans l'appareil WLED lui-même n'est pas modifié. Un nom repris de WLED suit les renommages ultérieurs dans WLED, un nom défini ici est conservé.",
                    it: 'Il nome nel dispositivo WLED stesso non viene modificato. Un nome preso da WLED segue le rinomine successive in WLED, un nome impostato qui rimane.',
                    es: 'El nombre en el propio dispositivo WLED no cambia. Un nombre tomado de WLED sigue los cambios posteriores en WLED, un nombre definido aquí se mantiene.',
                    pl: 'Nazwa w samym urządzeniu WLED nie jest zmieniana. Nazwa przejęta z WLED podąża za późniejszymi zmianami w WLED, nazwa ustawiona tutaj pozostaje.',
                    'zh-cn':
                        'WLED 设备本身的名称不会更改。从 WLED 获取的名称会跟随 WLED 中以后的重命名，此处设置的名称保持不变。',
                    uk: "Ім'я в самому пристрої WLED не змінюється. Ім'я, взяте з WLED, слідує за пізнішими перейменуваннями у WLED, ім'я, задане тут, залишається.",
                },
                style: { fontSize: 'smaller', color: 'gray' },
                newLine: true,
            },
            bundleCommands: {
                type: 'checkbox',
                newLine: true,
                label: {
                    en: 'Bundle commands that follow each other shortly',
                    de: 'Kurz aufeinander folgende Befehle bündeln',
                    ru: 'Объединять команды, следующие друг за другом',
                    pt: 'Agrupar comandos enviados em sequência rápida',
                    nl: 'Kort na elkaar volgende opdrachten bundelen',
                    fr: 'Regrouper les commandes qui se suivent de près',
                    it: 'Raggruppa i comandi inviati in rapida successione',
                    es: 'Agrupar comandos que se suceden rápidamente',
                    pl: 'Łącz polecenia wysyłane krótko po sobie',
                    'zh-cn': '合并短时间内连续发送的命令',
                    uk: 'Обʼєднувати команди, що йдуть одна за одною',
                },
            },
        },
    };
}

class dmWled extends dmUtils.DeviceManagement {
    async getInstanceInfo() {
        const data = {
            ...super.getInstanceInfo(),
            apiVersion: 'v1',
            actions: [
                {
                    id: 'refresh',
                    icon: 'fas fa-redo-alt',
                    title: '',
                    description: {
                        en: 'Refresh device list',
                        de: 'Geräteliste aktualisieren',
                        ru: 'Обновить список устройств',
                        pt: 'Atualizar lista de dispositivos',
                        nl: 'Vernieuw apparaatlijst',
                        fr: 'Actualiser la liste des appareils',
                        it: 'Aggiorna elenco dispositivi',
                        es: 'Actualizar lista de dispositivos',
                        pl: 'Odśwież listę urządzeń',
                        'zh-cn': '刷新设备列表',
                        uk: 'Оновити список пристроїв',
                    },
                    handler: this.handleRefresh.bind(this),
                },
                {
                    id: 'newDevice',
                    icon: 'fas fa-plus',
                    title: '',
                    description: {
                        en: 'Add new device to WLED',
                        de: 'Neues Gerät zu WLED hinzufügen',
                        ru: 'Добавить новое устройство в WLED',
                        pt: 'Adicionar novo dispositivo ao WLED',
                        nl: 'Voeg nieuw apparaat toe aan WLED',
                        fr: 'Ajouter un nouvel appareil à WLED',
                        it: 'Aggiungi nuovo dispositivo a WLED',
                        es: 'Agregar nuevo dispositivo a WLED',
                        pl: 'Dodaj nowe urządzenie do WLED',
                        'zh-cn': '将新设备添加到WLED',
                        uk: 'Додати новий пристрій до WLED',
                    },
                    handler: this.handleNewDevice.bind(this),
                },
                {
                    id: 'discover',
                    icon: 'fas fa-search',
                    title: '',
                    description: {
                        en: 'Discover new devices',
                        de: 'Neue Geräte suchen',
                        ru: 'Обнаружить новые устройства',
                        pt: 'Descubra novos dispositivos',
                        nl: 'Ontdek nieuwe apparaten',
                        fr: 'Découvrir de nouveaux appareils',
                        it: 'Scopri nuovi dispositivi',
                        es: 'Descubrir nuevos dispositivos',
                        pl: 'Odkryj nowe urządzenia',
                        'zh-cn': '发现新设备',
                        uk: 'Виявити нові пристрої',
                    },
                    handler: this.handleDiscover.bind(this),
                },
            ],
        };
        return data;
    }

    async handleRefresh(_context) {
        this.adapter.log.info('handleRefresh');
        return { refresh: true };
    }

    async handleDiscover(context) {
        await context.showMessage(
            'Discovery started. This process will take some time until all devices are discovered. You can close this dialog and continue working in the meantime.',
        );
        this.adapter.scanDevices();
        return { refresh: false };
    }

    async handleNewDevice(context) {
        const result = await context.showForm(
            {
                type: 'panel',
                items: {
                    ip: {
                        type: 'text',
                        trim: true,
                        placeholder: '192.168.0.1',
                        label: {
                            en: 'IP address',
                            de: 'IP-Adresse',
                            ru: 'IP адрес',
                            pt: 'Endereço de IP',
                            nl: 'IP adres',
                            fr: 'Adresse IP',
                            it: 'Indirizzo IP',
                            es: 'Dirección IP',
                            pl: 'Adres IP',
                            'zh-cn': 'IP地址',
                            uk: 'IP адреса',
                        },
                    },
                },
            },
            {
                data: {
                    ip: '',
                },
                title: {
                    en: 'Add new device',
                    de: 'Neues Gerät hinzufügen',
                    ru: 'Добавить новое устройство',
                    pt: 'Adicionar novo dispositivo',
                    nl: 'Voeg nieuw apparaat toe',
                    fr: 'Ajouter un nouvel appareil',
                    it: 'Aggiungi nuovo dispositivo',
                    es: 'Agregar nuevo dispositivo',
                    pl: 'Dodaj nowe urządzenie',
                    'zh-cn': '添加新设备',
                    uk: 'Додати новий пристрій',
                },
            },
        );
        if (result === null || result === undefined) {
            return { refresh: false };
        }

        // Check if ip was entered
        if (result.ip === '') {
            await context.showMessage({
                en: `Please enter an IP address`,
                de: `Bitte geben Sie eine IP-Adresse ein`,
                ru: `Пожалуйста, введите IP адрес`,
                pt: `Por favor, digite um endereço de IP`,
                nl: `Voer een IP-adres in`,
                fr: `Veuillez saisir une adresse IP`,
                it: `Inserisci un indirizzo IP`,
                es: `Por favor ingrese una dirección IP`,
                pl: `Proszę wprowadzić adres IP`,
                'zh-cn': `请输入IP地址`,
                uk: `Будь ласка, введіть IP адресу`,
            });
            return { refresh: false };
        }
        // Check if ip is valid
        if (result.ip !== '') {
            // Check ip has the right format
            const octets = result.ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
            if (!octets || octets.slice(1).some(octet => Number(octet) > 255)) {
                await context.showMessage({
                    en: `IP address ${result.ip} is not valid`,
                    de: `IP-Adresse ${result.ip} ist ungültig`,
                    ru: `IP адрес ${result.ip} недействителен`,
                    pt: `Endereço de IP ${result.ip} não é válido`,
                    nl: `IP-adres ${result.ip} is ongeldig`,
                    fr: `L'adresse IP ${result.ip} n'est pas valide`,
                    it: `L'indirizzo IP ${result.ip} non è valido`,
                    es: `La dirección IP ${result.ip} no es válida`,
                    pl: `Adres IP ${result.ip} jest nieprawidłowy`,
                    'zh-cn': `IP地址 ${result.ip} 无效`,
                    uk: `IP адреса ${result.ip} недійсна`,
                });
                return { refresh: false };
            }
        }
        // Device already known and connected, nothing to add
        if (this.adapter.devices[result.ip]?.connected) {
            await context.showMessage({
                en: `Device ${result.ip} is already added`,
                de: `Gerät ${result.ip} ist bereits hinzugefügt`,
                ru: `Устройство ${result.ip} уже добавлено`,
                pt: `O dispositivo ${result.ip} já foi adicionado`,
                nl: `Apparaat ${result.ip} is al toegevoegd`,
                fr: `L'appareil ${result.ip} est déjà ajouté`,
                it: `Il dispositivo ${result.ip} è già stato aggiunto`,
                es: `El dispositivo ${result.ip} ya está añadido`,
                pl: `Urządzenie ${result.ip} jest już dodane`,
                'zh-cn': `设备 ${result.ip} 已添加`,
                uk: `Пристрій ${result.ip} вже додано`,
            });
            return { refresh: false };
        }
        const res = await this.adapter.getDeviceJSON(result.ip);
        if (res !== 'success') {
            this.adapter.log.warn(`Device ${result.ip} could not be added, it does not respond`);
            await context.showMessage({
                en: `Device ${result.ip} does not respond. Please check the IP address and that the device is switched on.`,
                de: `Gerät ${result.ip} antwortet nicht. Bitte prüfe die IP-Adresse und ob das Gerät eingeschaltet ist.`,
                ru: `Устройство ${result.ip} не отвечает. Проверьте IP-адрес и включено ли устройство.`,
                pt: `O dispositivo ${result.ip} não responde. Verifique o endereço IP e se o dispositivo está ligado.`,
                nl: `Apparaat ${result.ip} reageert niet. Controleer het IP-adres en of het apparaat is ingeschakeld.`,
                fr: `L'appareil ${result.ip} ne répond pas. Vérifiez l'adresse IP et que l'appareil est allumé.`,
                it: `Il dispositivo ${result.ip} non risponde. Controlla l'indirizzo IP e che il dispositivo sia acceso.`,
                es: `El dispositivo ${result.ip} no responde. Compruebe la dirección IP y que el dispositivo esté encendido.`,
                pl: `Urządzenie ${result.ip} nie odpowiada. Sprawdź adres IP i czy urządzenie jest włączone.`,
                'zh-cn': `设备 ${result.ip} 无响应。请检查IP地址以及设备是否已开启。`,
                uk: `Пристрій ${result.ip} не відповідає. Перевірте IP-адресу та чи увімкнено пристрій.`,
            });
            return { refresh: false };
        }
        return { refresh: true };
    }

    async listDevices() {
        const devices = await this.adapter.getDevicesAsync();
        const arrDevices = [];
        for (const i in devices) {
            const status = {};

            const alive = await this.adapter.getStateAsync(`${devices[i]._id}._info._online`);
            if (alive !== null && alive !== undefined) {
                status.connection = alive.val ? 'connected' : 'disconnected';
            }

            const rssi = await this.adapter.getStateAsync(`${devices[i]._id}._info.wifi.rssi`);
            if (rssi !== null && rssi !== undefined) {
                status.rssi = `${rssi.val} dBm`;
            }

            const manufacturer = await this.adapter.getStateAsync(`${devices[i]._id}._info.brand`);

            const product = await this.adapter.getStateAsync(`${devices[i]._id}._info.product`);
            const arch = await this.adapter.getStateAsync(`${devices[i]._id}._info.arch`);
            const model = [product?.val, arch?.val]
                .filter(part => part !== undefined && part !== null && part !== '')
                .join(' ');

            const res = {
                id: devices[i]._id,
                name: devices[i].common.name,
                icon: devices[i].common.icon ? devices[i].common.icon : null,
                manufacturer: manufacturer ? manufacturer.val : null,
                model: model ? model : null,
                status: status,
                hasDetails: true,
                actions: [
                    {
                        id: 'delete',
                        icon: 'fa-solid fa-trash-can',
                        description: {
                            en: 'Delete this device',
                            de: 'Gerät löschen',
                            ru: 'Удалить это устройство',
                            pt: 'Excluir este dispositivo',
                            nl: 'Verwijder dit apparaat',
                            fr: 'Supprimer cet appareil',
                            it: 'Elimina questo dispositivo',
                            es: 'Eliminar este dispositivo',
                            pl: 'Usuń to urządzenie',
                            'zh-cn': '删除此设备',
                            uk: 'Видалити цей пристрій',
                        },
                        handler: this.handleDeleteDevice.bind(this),
                    },
                    {
                        id: 'edit',
                        icon: 'fa-solid fa-pen',
                        description: {
                            en: 'Edit this device',
                            de: 'Gerät bearbeiten',
                            ru: 'Изменить это устройство',
                            pt: 'Editar este dispositivo',
                            nl: 'Dit apparaat bewerken',
                            fr: 'Modifier cet appareil',
                            it: 'Modifica questo dispositivo',
                            es: 'Editar este dispositivo',
                            pl: 'Edytuj to urządzenie',
                            'zh-cn': '编辑此设备',
                            uk: 'Редагувати цей пристрій',
                        },
                        handler: this.handleEditDevice.bind(this),
                    },
                ],
            };
            // if id contains gateway remove res.actions
            if (devices[i]._id.includes('localhost')) {
                res.actions = [];
            }
            arrDevices.push(res);
        }
        return arrDevices;
    }

    async handleDeleteDevice(id, context) {
        // Remove namespace from context
        const name = id.replace(/^wled\.\d+\./, '');

        const response = await context.showConfirmation({
            en: `Do you really want to delete the device ${name}?`,
            de: `Möchten Sie das Gerät ${name} wirklich löschen?`,
            ru: `Вы действительно хотите удалить устройство ${name}?`,
            pt: `Você realmente deseja excluir o dispositivo ${name}?`,
            nl: `Weet u zeker dat u het apparaat ${name} wilt verwijderen?`,
            fr: `Voulez-vous vraiment supprimer l'appareil ${name} ?`,
            it: `Vuoi davvero eliminare il dispositivo ${name}?`,
            es: `¿Realmente desea eliminar el dispositivo ${name}?`,
            pl: `Czy na pewno chcesz usunąć urządzenie ${name}?`,
            'zh-cn': `您真的要删除设备 ${name} 吗？`,
            uk: `Ви дійсно бажаєте видалити пристрій ${name}?`,
        });

        // delete device
        if (response === false) {
            return { refresh: false };
        }
        const result = await this.adapter.delDevice(name);
        if (result === false) {
            await context.showMessage({
                en: `Can not delete device ${name}`,
                de: `Gerät ${name} kann nicht gelöscht werden`,
                ru: `Невозможно удалить устройство ${name}`,
                pt: `Não é possível excluir o dispositivo ${name}`,
                nl: `Kan apparaat ${name} niet verwijderen`,
                fr: `Impossible de supprimer l'appareil ${name}`,
                it: `Impossibile eliminare il dispositivo ${name}`,
                es: `No se puede eliminar el dispositivo ${name}`,
                pl: `Nie można usunąć urządzenia ${name}`,
                'zh-cn': `无法删除设备 ${name}`,
                uk: `Не вдалося видалити пристрій ${name}`,
            });
            return { refresh: false };
        }
        return { refresh: true };
    }

    /**
     * Edit a device: name in ioBroker, take over the name from WLED (#927) and bundling of commands (#926)
     *
     * @param {string} id device object id
     * @param {object} context action context of the Device Manager
     */
    async handleEditDevice(id, context) {
        const obj = await this.adapter.getObjectAsync(id);
        if (!obj) {
            return { refresh: false };
        }
        const mac = obj.native?.mac || id.replace(/^wled\.\d+\./, '');
        const wledName = obj.native?.wledName || '';
        const currentName = typeof obj.common?.name === 'string' ? obj.common.name : '';
        const bundleState = await this.adapter.getStateAsync(`${mac}.bundleCommands`);
        const bundleCommands = bundleState?.val !== false;

        const result = await context.showForm(editDeviceForm(wledName), {
            data: {
                newName: currentName,
                syncName: false,
                bundleCommands,
            },
            title: {
                en: 'Edit device',
                de: 'Gerät bearbeiten',
                ru: 'Изменить устройство',
                pt: 'Editar dispositivo',
                nl: 'Apparaat bewerken',
                fr: "Modifier l'appareil",
                it: 'Modifica dispositivo',
                es: 'Editar dispositivo',
                pl: 'Edytuj urządzenie',
                'zh-cn': '编辑设备',
                uk: 'Редагувати пристрій',
            },
        });
        if (result === null || result === undefined) {
            return { refresh: false };
        }

        let refresh = false;
        const newName = result.syncName && wledName ? wledName : String(result.newName ?? '').trim();
        if (newName !== '' && newName !== currentName) {
            await this.adapter.extendObjectAsync(id, { common: { name: newName } });
            this.adapter.log.info(
                result.syncName
                    ? `Device ${mac} takes over the name from WLED: ${newName}`
                    : `Device ${mac} renamed to ${newName}`,
            );
            refresh = true;
        }
        if (result.bundleCommands !== undefined && result.bundleCommands !== bundleCommands) {
            await this.adapter.setBundleCommands(mac, result.bundleCommands !== false);
        }
        return { refresh };
    }

    async getDeviceDetails(id, _action, _context) {
        const devices = await this.adapter.getDevicesAsync();
        const device = devices.find(d => d._id === id);
        if (!device) {
            return { error: 'Device not found' };
        }
        const mac = device.native.mac;
        const macWithColon = mac.replace(/(.{2})/g, '$1:').slice(0, -1);

        const version = await this.adapter.getStateAsync(`${id}._info.ver`);

        const data = {
            id: device._id,
            schema: {
                type: 'panel',
                items: {
                    mac: {
                        type: 'staticText',
                        text: `<b>MAC:</b> ${macWithColon}`,
                        newLine: true,
                    },
                    version: {
                        type: 'staticText',
                        text: `<b>Firmware version:</b> ${version?.val}`,
                        newLine: true,
                    },
                    wledName: {
                        type: 'staticText',
                        text: `<b>Name in WLED:</b> ${device.native.wledName ?? ''}`,
                        newLine: true,
                    },
                },
            },
        };

        return data;
    }
}

module.exports = dmWled;
