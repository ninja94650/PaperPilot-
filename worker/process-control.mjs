export function terminateProcessTree(child, signal = "SIGKILL", killGroup = process.kill, useProcessGroup = false) {
  if (!child) return false;
  if (child.pid && useProcessGroup) {
    try {
      killGroup(-child.pid, signal);
      return true;
    } catch (error) {
      if (error?.code === "ESRCH") return false;
    }
  }
  try {
    return child.kill(signal);
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    throw error;
  }
}
