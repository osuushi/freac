// Read-only POSIX session membership. Signalling policy stays in the Electron host.
#include <charconv>
#include <iostream>
#include <string>
#include <vector>
#include <unistd.h>
#ifdef __APPLE__
#include <libproc.h>
#include <sys/proc.h>
#else
#include <filesystem>
#include <fstream>
#include <sstream>
#endif

#ifdef __APPLE__
void inspectSession(pid_t session) {
  const int bytes = proc_listpids(PROC_ALL_PIDS, 0, nullptr, 0);
  if (bytes <= 0) throw std::runtime_error("Cannot enumerate processes");
  std::vector<pid_t> pids(bytes / sizeof(pid_t) + 128);
  const int received = proc_listpids(PROC_ALL_PIDS, 0, pids.data(), pids.size() * sizeof(pid_t));
  if (received < 0) throw std::runtime_error("Cannot enumerate processes");
  for (int i = 0; i < received / static_cast<int>(sizeof(pid_t)); ++i) {
    const pid_t pid = pids[i];
    if (pid <= 0 || getsid(pid) != session) continue;
    proc_bsdinfo info{};
    if (proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &info, sizeof(info)) != sizeof(info)) continue;
    if (info.pbi_status == SZOMB) continue;
    std::cout << pid << ' ' << info.pbi_ppid << ' ' << info.pbi_pgid << ' '
              << info.pbi_start_tvsec << ':' << info.pbi_start_tvusec << '\n';
  }
}
#else
void inspectSession(pid_t session) {
  for (const auto& entry : std::filesystem::directory_iterator("/proc")) {
    const std::string name = entry.path().filename().string();
    if (name.empty() || name.find_first_not_of("0123456789") != std::string::npos) continue;
    std::ifstream input(entry.path() / "stat");
    std::string line;
    if (!std::getline(input, line)) continue;
    const auto end = line.rfind(')');
    if (end == std::string::npos) continue;
    std::istringstream fields(line.substr(end + 2));
    std::vector<std::string> values;
    for (std::string value; fields >> value;) values.push_back(value);
    if (values.size() < 20 || values[0] == "Z" || values[3] != std::to_string(session)) continue;
    std::cout << name << ' ' << values[1] << ' ' << values[2] << ' ' << values[19] << '\n';
  }
}
#endif
int main(int argc, char** argv) {
  if (argc != 2) return 2;
  pid_t session = 0;
  const std::string value(argv[1]);
  const auto parsed = std::from_chars(value.data(), value.data() + value.size(), session);
  if (parsed.ec != std::errc{} || parsed.ptr != value.data() + value.size() || session <= 0) return 2;
  try { inspectSession(session); }
  catch (const std::exception& error) { std::cerr << error.what() << '\n'; return 1; }
}
