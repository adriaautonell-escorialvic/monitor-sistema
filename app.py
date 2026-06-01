"""
Servidor web del monitor del sistema.
Llegeix dades de la màquina (CPU, RAM, disc...) i les envia al navegador.
"""

import time
import platform
import socket
import collections
from flask import Flask, jsonify, send_from_directory
import psutil

app = Flask(__name__)

# Guardem les darreres lectures en tres escales de temps:
#   - Per minut: una mostra cada 2 segons, guardem les 30 últimes (~1 minut)
#   - Per hora:  una mostra cada 2 minuts, guardem les 30 últimes (~1 hora)
#   - Per dia:   una mostra cada 48 minuts, guardem les 30 últimes (~1 dia)
# Fem servir "deque" perquè quan s'omple, les dades velles desapareixen soles.
HIST_SIZE     = 30
HOUR_INTERVAL = 60    # cada 60 crides a /api/stats guardem 1 mostra d'hora
DAY_INTERVAL  = 1440  # cada 1440 crides guardem 1 mostra de dia

hist = {
    "minute": {"cpu": collections.deque(maxlen=HIST_SIZE),
               "ram": collections.deque(maxlen=HIST_SIZE),
               "ts":  collections.deque(maxlen=HIST_SIZE)},
    "hour":   {"cpu": collections.deque(maxlen=HIST_SIZE),
               "ram": collections.deque(maxlen=HIST_SIZE),
               "ts":  collections.deque(maxlen=HIST_SIZE)},
    "day":    {"cpu": collections.deque(maxlen=HIST_SIZE),
               "ram": collections.deque(maxlen=HIST_SIZE),
               "ts":  collections.deque(maxlen=HIST_SIZE)},
}

_call_count = 0   # quantes vegades s'ha cridat /api/stats des que el servidor va arrencar
_acc        = {"cpu": [], "ram": []}  # acumulem lectures per calcular mitjanes dels intervals llargs


# Llegim la distribució Linux del fitxer estàndard /etc/os-release
def _get_distro():
    try:
        with open("/etc/os-release") as f:
            data = dict(
                line.strip().split("=", 1)
                for line in f if "=" in line
            )
        name    = data.get("NAME",    "Linux").strip('"')
        version = data.get("VERSION", "").strip('"')
        return f"{name} {version}".strip()
    except Exception:
        return "Linux"


def _get_cpu_model():
    # Llegim el model de CPU de /proc/cpuinfo, que és un fitxer virtual del kernel Linux
    try:
        with open("/proc/cpuinfo") as f:
            for line in f:
                if "model name" in line:
                    return line.split(":", 1)[1].strip()
    except Exception:
        pass
    return platform.processor() or "Desconegut"


# Recopila tota la informació estàtica del sistema (nom, SO, CPU, IP...)
# Només cal cridar-la una vegada: aquestes dades no canvien mentre el servidor està engegat
def get_system_info():
    uname    = platform.uname()
    cpu_freq = psutil.cpu_freq()
    net_if   = psutil.net_if_addrs()

    # Cerquem la primera adreça IP que no sigui de loopback (127.x)
    ip_addr = "–"
    for iface, addrs in net_if.items():
        for a in addrs:
            if a.family.name == "AF_INET" and not a.address.startswith("127."):
                ip_addr = a.address
                break
        if ip_addr != "–":
            break

    return {
        "hostname":       socket.gethostname(),
        "distro":         _get_distro(),
        "kernel":         uname.release,
        "arch":           uname.machine,
        "cpu_model":      _get_cpu_model(),
        "cpu_freq_mhz":   round(cpu_freq.current) if cpu_freq else "–",
        "cpu_freq_max":   round(cpu_freq.max)      if cpu_freq else "–",
        "cores_logical":  psutil.cpu_count(logical=True),
        "cores_physical": psutil.cpu_count(logical=False),
        "ram_total_gb":   round(psutil.virtual_memory().total / 1024**3, 2),
        "ip":             ip_addr,
        "python":         platform.python_version(),
    }


# Llegeix les mètriques que canvien contínuament: CPU, RAM, disc, uptime i càrrega
def get_stats():
    cpu_percent = psutil.cpu_percent(interval=0.5)
    ram          = psutil.virtual_memory()
    disk         = psutil.disk_usage("/")
    boot_time    = psutil.boot_time()
    # Calculem quant de temps porta engegat el sistema convertint segons a h/m/s
    uptime_secs  = time.time() - boot_time
    hours, rem   = divmod(int(uptime_secs), 3600)
    minutes, secs = divmod(rem, 60)
    load          = psutil.getloadavg()

    return {
        "cpu": {
            "percent":        cpu_percent,
            "cores_logical":  psutil.cpu_count(logical=True),
            "cores_physical": psutil.cpu_count(logical=False),
        },
        "ram": {
            "percent":  ram.percent,
            "used_gb":  round(ram.used   / 1024**3, 2),
            "total_gb": round(ram.total  / 1024**3, 2),
            "free_gb":  round(ram.free   / 1024**3, 2),
        },
        "disk": {
            "percent":  disk.percent,
            "used_gb":  round(disk.used  / 1024**3, 1),
            "total_gb": round(disk.total / 1024**3, 1),
            "free_gb":  round(disk.free  / 1024**3, 1),
        },
        "load": {
            "l1":  round(load[0], 2),
            "l5":  round(load[1], 2),
            "l15": round(load[2], 2),
        },
        "uptime":    f"{hours}h {minutes}m {secs}s",
        "timestamp": time.strftime("%H:%M:%S"),
    }


# Rutes Flask: cada @app.route defineix una adreça URL que el servidor respon

# Pàgina principal: envia el fitxer index.html al navegador
@app.route("/")
def index():
    return send_from_directory('web', 'index.html')


# Qualsevol altre fitxer de la carpeta web/ (monitor.css, monitor.js...)
@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory('web', filename)


# Retorna la informació estàtica del sistema en format JSON
@app.route("/api/sysinfo")
def api_sysinfo():
    return jsonify(get_system_info())


# Retorna les mètriques actuals + l'historial de les gràfiques
# Aquesta ruta és cridada cada 2 segons pel navegador
@app.route("/api/stats")
def api_stats():
    global _call_count
    stats = get_stats()
    _call_count += 1

    cpu = stats["cpu"]["percent"]
    ram = stats["ram"]["percent"]
    ts  = stats["timestamp"]

    # Sempre afegim la mostra a l'historial de minut
    hist["minute"]["cpu"].append(cpu)
    hist["minute"]["ram"].append(ram)
    hist["minute"]["ts"].append(ts)

    # Acumulem per calcular la mitjana dels intervals més llargs
    _acc["cpu"].append(cpu)
    _acc["ram"].append(ram)

    # Cada 2 minuts aprox. guardem una mostra a l'historial d'hora
    if _call_count % HOUR_INTERVAL == 0:
        hist["hour"]["cpu"].append(round(sum(_acc["cpu"]) / len(_acc["cpu"]), 1))
        hist["hour"]["ram"].append(round(sum(_acc["ram"]) / len(_acc["ram"]), 1))
        hist["hour"]["ts"].append(ts)

    # Cada 48 minuts aprox. guardem una mostra de dia i buidem l'acumulador
    if _call_count % DAY_INTERVAL == 0:
        hist["day"]["cpu"].append(round(sum(_acc["cpu"]) / len(_acc["cpu"]), 1))
        hist["day"]["ram"].append(round(sum(_acc["ram"]) / len(_acc["ram"]), 1))
        hist["day"]["ts"].append(time.strftime("%H:%M"))
        _acc["cpu"].clear()
        _acc["ram"].clear()

    # Afegim l'historial a la resposta perquè el navegador pugui dibuixar les gràfiques
    stats["history"] = {
        "minute": {"labels": list(hist["minute"]["ts"]),
                   "cpu":    list(hist["minute"]["cpu"]),
                   "ram":    list(hist["minute"]["ram"])},
        "hour":   {"labels": list(hist["hour"]["ts"]),
                   "cpu":    list(hist["hour"]["cpu"]),
                   "ram":    list(hist["hour"]["ram"])},
        "day":    {"labels": list(hist["day"]["ts"]),
                   "cpu":    list(hist["day"]["cpu"]),
                   "ram":    list(hist["day"]["ram"])},
    }
    return jsonify(stats)


# Ruta de comprovació ràpida: només per verificar que el servidor respon
@app.route("/api/health")
def health():
    return jsonify({"status": "ok", "time": time.strftime("%Y-%m-%d %H:%M:%S")})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
