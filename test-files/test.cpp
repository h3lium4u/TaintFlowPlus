#include <stdio.h>
#include <stdlib.h>
#include <string.h>

void vulnerable_function(char* userInput) {
    char buffer[100];
    
    // 1. Buffer Overflow (cpp-buffer-overflow)
    strcpy(buffer, userInput);
    
    // 2. OS Command Injection (cpp-cmd-inj)
    system(userInput);
    
    // 3. Integer Overflow in allocation (cpp-integer-overflow)
    int width = 200;
    int height = 300;
    char* data = (char*)malloc(width * height);
    
    // 4. Format String (cpp-format-string)
    printf(userInput);
}

int main(int argc, char** argv) {
    if (argc > 1) {
        vulnerable_function(argv[1]);
    }
    return 0;
}
