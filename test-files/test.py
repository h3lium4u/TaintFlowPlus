# Vulnerable Python Snippets
def vulnerable_run():
    # 1. RCE
    eval(user_input)
    exec(user_input)
    
    # 2. SQL Injection
    cursor.execute(f"SELECT * FROM users WHERE name = '{username}'")
    cursor.execute("SELECT * FROM users WHERE name = '%s'" % username)
    
    # 3. OS Command Injection
    os.system(f"ping {ip}")
    subprocess.call(f"ping {ip}", shell=True)
    
    # 4. Unsafe Deserialization
    pickle.loads(user_data)
    yaml.load(user_yaml) # unsafe
    
    # 5. Path Traversal
    open(f"../{filename}", 'r')

# Safe Python Snippets
def safe_run():
    # Safe SQL query using parameters
    cursor.execute("SELECT * FROM users WHERE name = %s", (username,))
    
    # Safe subprocess execution with shell=False
    subprocess.run(["ping", ip], shell=False)
    
    # Safe YAML load
    yaml.safe_load(user_yaml)
    
    # Safe JSON loads
    json.loads(user_data)
