# monitor-sistema

Monitor de sistema Linux que exposa informació de CPU i RAM a través d'una interfície web. Només compatible amb Linux.

## Requisits previs

- Linux (qualsevol distribució moderna)
- Python 3.8 o superior
- pip
- systemd (per executar-lo com a servei)

## Instal·lació

### 1. Clonar el repositori

```bash
git clone <url-del-repositori>
cd servei
```

### 2. Crear l'entorn virtual

```bash
python3 -m venv venv
```

### 3. Activar l'entorn virtual

```bash
source venv/bin/activate
```

### 4. Instal·lar les dependències

```bash
pip install -r requirements.txt
```

### 5. Executar manualment (opcional)

```bash
python app.py
```

L'aplicació estarà disponible a `http://localhost:5000`.

## Instal·lació com a servei del sistema (systemd)

Per executar el monitor automàticament en arrencar el sistema:

### 1. Copiar el fitxer de servei

```bash
sudo cp monitor.service /etc/systemd/system/monitor.service
```

### 2. Recarregar systemd i activar el servei

```bash
sudo systemctl daemon-reload
sudo systemctl enable monitor
sudo systemctl start monitor
```

### 3. Comprovar l'estat

```bash
sudo systemctl status monitor
```

### Aturar o desactivar el servei

```bash
sudo systemctl stop monitor
sudo systemctl disable monitor
```

## Notes

- L'entorn virtual (`venv/`) no s'inclou al repositori. Cal crear-lo localment seguint els passos anteriors.
- El fitxer `monitor.service` apunta per defecte a `/home/adria/servei/`. Si s'instal·la en un altre directori o amb un altre usuari, cal editar els camps `User` i `WorkingDirectory` del fitxer de servei abans de copiar-lo.
