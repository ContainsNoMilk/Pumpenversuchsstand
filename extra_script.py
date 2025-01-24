Import("env")

def before_build(source, target, env):
    print("LittleFS-Dateisystem wird erstellt...")
    env.Execute("pio run --target buildfs")

env.AddPreAction("build", before_build)