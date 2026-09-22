// SPDX-License-Identifier: LGPL-2.1-or-later
/* Freac P0 adaptation: replace the narrow FreeCAD logging/unreachable surface.
 * No solver equations or numerical policy are changed. */
#pragma once

#include <cstdio>
#include <cstdlib>

namespace Base {
class ConsoleSink {
public:
    void log(const char* message) const
    {
        std::fputs(message, stderr);
    }

    template <typename... Args>
    void log(const char* format, Args... args) const
    {
        std::fprintf(stderr, format, args...);
    }

    void warning(const char* message) const
    {
        std::fputs(message, stderr);
    }

    template <typename... Args>
    void warning(const char* format, Args... args) const
    {
        std::fprintf(stderr, format, args...);
    }
};

inline const ConsoleSink& Console()
{
    static const ConsoleSink sink;
    return sink;
}

[[noreturn]] inline void unreachable()
{
    std::fputs("PlaneGCS adapter reached an unreachable branch\n", stderr);
    std::abort();
}
} // namespace Base
