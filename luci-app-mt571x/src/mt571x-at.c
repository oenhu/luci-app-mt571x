/*
 * mt571x-at: C implementation of AT helper for MT5710/MT5711
 * Copyright (C) 2026
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <termios.h>
#include <sys/file.h>
#include <sys/select.h>
#include <dirent.h>

#define LOCK_FILE "/var/lock/mt571x-at.lock"
#define DEFAULT_PORT "/dev/mt571x-at"

static int set_serial_attribs(int fd, int speed) {
    struct termios tty;
    if (tcgetattr(fd, &tty) != 0) return -1;

    cfsetospeed(&tty, speed);
    cfsetispeed(&tty, speed);

    tty.c_cflag = (tty.c_cflag & ~CSIZE) | CS8;     // 8-bit chars
    tty.c_iflag &= ~IGNBRK;                          // disable break processing
    tty.c_lflag = 0;                                 // no signaling chars, no echo,
                                                     // no canonical processing
    tty.c_oflag = 0;                                 // no remapping, no delays
    tty.c_cc[VMIN]  = 0;                             // read doesn't block
    tty.c_cc[VTIME] = 5;                             // 0.5 seconds read timeout

    tty.c_iflag &= ~(IXON | IXOFF | IXANY);          // shut off xon/xoff ctrl
    tty.c_cflag |= (CLOCAL | CREAD);                 // ignore modem controls,
                                                     // enable reading
    tty.c_cflag &= ~(PARENB | PARODD);               // shut off parity
    tty.c_cflag &= ~CSTOPB;
    tty.c_cflag &= ~CRTSCTS;

    if (tcsetattr(fd, TCSANOW, &tty) != 0) return -1;
    return 0;
}

int main(int argc, char *argv[]) {
    if (argc < 2) {
        fprintf(stderr, "Usage: %s <AT_CMD> [timeout_sec]\n", argv[0]);
        return 1;
    }

    const char *cmd = argv[1];
    int timeout_sec = 3;
    if (argc >= 3) timeout_sec = atoi(argv[2]);

    int lock_fd = open(LOCK_FILE, O_CREAT | O_RDWR, 0666);
    if (lock_fd >= 0) {
        flock(lock_fd, LOCK_EX);
    }

    const char *port = DEFAULT_PORT;
    if (access(port, F_OK) != 0) {
        port = "/dev/ttyUSB1";
    }

    int fd = open(port, O_RDWR | O_NOCTTY | O_SYNC);
    if (fd < 0) {
        perror("open serial");
        if (lock_fd >= 0) {
            flock(lock_fd, LOCK_UN);
            close(lock_fd);
        }
        return 2;
    }

    set_serial_attribs(fd, B115200);
    tcflush(fd, TCIOFLUSH);

    char send_buf[512];
    snprintf(send_buf, sizeof(send_buf), "%s\r\n", cmd);
    write(fd, send_buf, strlen(send_buf));

    fd_set readfs;
    struct timeval tv;
    char recv_buf[4096];
    int total_bytes = 0;

    while (1) {
        FD_ZERO(&readfs);
        FD_SET(fd, &readfs);
        tv.tv_sec = timeout_sec;
        tv.tv_usec = 0;

        int ret = select(fd + 1, &readfs, NULL, NULL, &tv);
        if (ret > 0 && FD_ISSET(fd, &readfs)) {
            int n = read(fd, recv_buf + total_bytes, sizeof(recv_buf) - total_bytes - 1);
            if (n > 0) {
                total_bytes += n;
                recv_buf[total_bytes] = '\0';
                if (strstr(recv_buf, "OK") || strstr(recv_buf, "ERROR")) {
                    break;
                }
            } else {
                break;
            }
        } else {
            // Timeout
            break;
        }
    }

    if (total_bytes > 0) {
        printf("%s\n", recv_buf);
    }

    close(fd);
    if (lock_fd >= 0) {
        flock(lock_fd, LOCK_UN);
        close(lock_fd);
    }
    return 0;
}
