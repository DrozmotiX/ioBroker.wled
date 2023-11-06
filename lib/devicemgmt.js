const dmUtils = require('@jey-cee/dm-utils');

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
                        uk: 'Оновити список пристроїв'
                    },
                    handler: this.handleRefresh.bind(this)
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
                        uk: 'Додати новий пристрій до WLED'
                    },
                    handler: this.handleNewDevice.bind(this)
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
                        uk: 'Виявити нові пристрої'
                    },
                    handler: this.handleDiscover.bind(this)
                }
            ],
        };
        return data;
    }

    async handleRefresh(context) {
        this.adapter.log.info('handleRefresh');
        return { refresh: true };
    }


    async handleDiscover(context) {
        await context.showMessage(
            'Dicovery started. This process will take some time until all devices are discovered. You can close this dialog and continue working in the meantime.');
        this.adapter.scanDevices();
        return { refresh: false };
    }

    async handleNewDevice(context) {
        const result = await context.showForm({
                type : 'panel',
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
                            uk: 'IP адреса'
                        }
                    }
                }
            },
            {
                data: {
                    ip: ''
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
                    uk: 'Додати новий пристрій'
                }
            }
        );
        if(result === null || result === undefined) {
            return { refresh: false };
        }

        // Check if ip was entered
        if(result.ip === '') {
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
                uk: `Будь ласка, введіть IP адресу`
            });
            return { refresh: false };
        }
        // Check if ip is valid
        if(result.ip !== '') {
            // Check ip has the right format
            if(!result.ip.match(/^(\d{1,3}\.){3}\d{1,3}$/)) {
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
                    uk: `IP адреса ${result.ip} недійсна`
                });
                return { refresh: false };
            }
        }
        const res = await this.adapter.getDeviceJSON(result.ip);
        if(res === null) {
            this.adapter.log.warn(res);
        }
        return { refresh: true };
    }


    async listDevices() {
        const devices = await this.adapter.getDevicesAsync();
        const arrDevices = [];
        for (const i in devices) {
            const status = {};

            const alive = await this.adapter.getStateAsync(`${devices[i]._id}._info._online`);
            if(alive !== null && alive !== undefined) {
                status.connection = alive.val ? 'connected' : 'disconnected';
            }

            const rssi = await this.adapter.getStateAsync(`${devices[i]._id}._info.wifi.rssi`);
            if(rssi !== null && rssi !== undefined) {
                status.rssi = `${rssi.val} dBm`;
            }

            const manufacturer = await this.adapter.getStateAsync(`${devices[i]._id}._info.brand`);

            const product = await this.adapter.getStateAsync(`${devices[i]._id}._info.product`);
            const arch = await this.adapter.getStateAsync(`${devices[i]._id}._info.arch`);
            const model = `${product?.val} ${arch?.val}`;

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
                            uk: 'Видалити цей пристрій'
                        },
                        handler: this.handleDeleteDevice.bind(this)
                    },
                    {
                        id: 'rename',
                        icon: 'fa-solid fa-pen',
                        description: {
                            en: 'Rename this device',
                            de: 'Gerät umbenennen',
                            ru: 'Переименовать это устройство',
                            pt: 'Renomear este dispositivo',
                            nl: 'Hernoem dit apparaat',
                            fr: 'Renommer cet appareil',
                            it: 'Rinomina questo dispositivo',
                            es: 'Renombrar este dispositivo',
                            pl: 'Zmień nazwę tego urządzenia',
                            'zh-cn': '重命名此设备',
                            uk: 'Перейменуйте цей пристрій'
                        },
                        handler: this.handleRenameDevice.bind(this)
                    }
                ]
            };
            // if id contains gateway remove res.actions
            if(devices[i]._id.includes('localhost')) {
                res.actions = [];
            }
            arrDevices.push(res);
        }
        return arrDevices;
    }

    async handleDeleteDevice(id, context) {
        // Remove namespace from context
        const name = id.replace(/wled\.\d\./, '');

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
            uk: `Ви дійсно бажаєте видалити пристрій ${name}?`
        });

        // delete device
        if(response === false) {
            return {refresh: false};
        }
        const result = this.adapter.delDevice(name);
        if(result === false) {
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
                uk: `Не вдалося видалити пристрій ${name}`
            });
            return {refresh: false};
        } else {
            return {refresh: true};
        }
    }

    async handleRenameDevice(id, context) {
        const result = await context.showForm({
            type : 'panel',
            items: {
                newName: {
                    type: 'text',
                    trim: false,
                    placeholder: '',
                },
                note: {
                    type: 'staticText',
                    text: {
                        en: 'Note: This will only change the name of the device object in ioBroker. The name of the device itself will not be changed.',
                        de: 'Hinweis: Dies ändert nur den Namen des Geräteobjekts in ioBroker. Der Name des Geräts selbst wird nicht geändert.',
                        ru: 'Примечание. Это изменит только имя объекта устройства в ioBroker. Имя самого устройства не будет изменено.',
                        pt: 'Nota: isso mudará apenas o nome do objeto do dispositivo no ioBroker. O nome do próprio dispositivo não será alterado.',
                        nl: 'Opmerking: hiermee wordt alleen de naam van het apparaatobject in ioBroker gewijzigd. De naam van het apparaat zelf wordt niet gewijzigd.',
                        fr: 'Remarque : cela ne changera que le nom de l\'objet de l\'appareil dans ioBroker. Le nom de l\'appareil lui-même ne sera pas modifié.',
                        it: 'Nota: questo cambierà solo il nome dell\'oggetto del dispositivo in ioBroker. Il nome del dispositivo stesso non verrà modificato.',
                        es: 'Nota: esto solo cambiará el nombre del objeto del dispositivo en ioBroker. El nombre del dispositivo en sí no cambiará.',
                        pl: 'Uwaga: spowoduje to zmianę nazwy obiektu urządzenia w ioBroker. Nazwa samego urządzenia nie zostanie zmieniona.',
                        'zh-cn': '注意：这只会更改ioBroker中设备对象的名称。设备本身的名称不会更改。',
                        uk: 'Примітка. Це змінить лише ім\'я об\'єкта пристрою в ioBroker. Ім\'я самого пристрою не буде змінено.'
                    },
                    style: { fontSize: 'smaller', color: 'gray' },
                    newLine: true
                }
            }}, {
            data: {
                newName: ''
            },
            title: {
                en: 'Enter new name',
                de: 'Neuen Namen eingeben',
                ru: 'Введите новое имя',
                pt: 'Digite um novo nome',
                nl: 'Voer een nieuwe naam in',
                fr: 'Entrez un nouveau nom',
                it: 'Inserisci un nuovo nome',
                es: 'Ingrese un nuevo nombre',
                pl: 'Wpisz nowe imię',
                'zh-cn': '输入新名称',
                uk: 'Введіть нове ім\'я'
            }
        });
        if(result === null || result === undefined) {
            return {refresh: false};
        }
        if(result.newName === undefined || result.newName === '') {
            return {refresh: false};
        }
        const obj = {
            common: {
                name: result.newName
            }
        };
        const res = await this.adapter.extendObjectAsync(id, obj);
        this.adapter.log.info(JSON.stringify(res));
        if(res === null) {
            this.adapter.log.warn(`Can not rename device ${context.id}: ${JSON.stringify(res)}`);
            return {refresh: false};
        }
        return {refresh: true};
    }

    async getDeviceDetails(id, action, context) {
        const devices = await this.adapter.getDevicesAsync();
        const device = devices.find(d => d._id === id);
        if(!device) {
            return {error: 'Device not found'};
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
                        newLine: true
                    },
                    version: {
                        type: 'staticText',
                        text: `<b>Firmware version:</b> ${version?.val}`,
                        newLine: true
                    },
                }
            }

        };

        return data;
    }
}

module.exports = dmWled;