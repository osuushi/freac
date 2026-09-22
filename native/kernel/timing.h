#pragma once
#include <chrono>
#include <cstdlib>
#include <iostream>
#include <string>

// Opt-in phase timings stay on stderr, outside the geometry protocol.
class KernelTiming {
    using Clock = std::chrono::steady_clock;
    Clock::time_point start = Clock::now(), previous = start;
    bool enabled = std::getenv("FREAC_KERNEL_TIMING") != nullptr;
    std::string kind = "parse";
public:
    explicit KernelTiming(const std::string& value = "parse") : kind(value) {}
    void operation(const std::string& value) { kind = value; }
    void phase(const char* name) {
        if (!enabled) return;
        const auto now = Clock::now();
        std::cerr << "kernel " << kind << ' ' << name << ' '
                  << std::chrono::duration<double, std::milli>(now - previous).count() << " ms\n";
        previous = now;
    }
    ~KernelTiming() {
        if (enabled) std::cerr << "kernel " << kind << " total "
            << std::chrono::duration<double, std::milli>(Clock::now() - start).count() << " ms\n";
    }
};
