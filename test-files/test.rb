# Vulnerable Ruby Snippets
def vulnerable(userInput)
  # 1. RCE / eval
  eval(userInput)

  # 2. Command Injection
  system("ping #{userInput}")
  `ping #{userInput}`
  exec("echo " + userInput)

  # 3. SQL Injection
  User.where("name = '#{userInput}'")
  User.find_by_sql("SELECT * FROM users WHERE name = '#{userInput}'")

  # 4. Unsafe Deserialization
  YAML.load(userInput)
  Marshal.load(userInput)
end

# Safe Ruby Snippets
def safe(userInput)
  # Safe Command Execution
  system("ping", userInput)

  # Safe SQL query using Active Record parametrization
  User.where("name = ?", userInput)
  User.where(name: userInput)

  # Safe YAML load
  YAML.safe_load(userInput)
end
