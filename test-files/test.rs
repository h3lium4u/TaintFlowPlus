use std::process::Command;

fn vulnerable(userInput: &str) {
    // 1. Command Injection (using shell execution with format!)
    Command::new("sh")
        .arg("-c")
        .arg(format!("echo {}", userInput))
        .spawn()
        .unwrap();

    // 2. Unsafe usage / Raw pointer deref without safety comments
    unsafe {
        let raw = 0x12345 as *const i32;
        let val = *raw;
    }
}

fn safe(userInput: &str) {
    // Safe Command Execution without shell
    Command::new("echo")
        .arg(userInput)
        .spawn()
        .unwrap();
}
