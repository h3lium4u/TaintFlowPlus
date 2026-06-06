# R Language Test File for TaintFlow+

# 1. Arbitrary Code Execution (r-rce)
user_input <- "print('hello')"
eval(parse(text = user_input))
system(paste("ping", user_input))

# 2. Path Traversal (r-path-traversal)
file_path <- "user_input_path.csv"
data <- read.csv(file_path)

# 3. Weak SSL validation (r-weak-ssl)
connection <- curl::curl(url = "https://example.com", ssl_verifypeer = FALSE)
