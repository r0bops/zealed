// Real backend placeholder: implemented once the zingo-cli NU7 check is done.
import type { ZcashBackend } from "./zcash";

export const zingoBackend: ZcashBackend = {
  name: "zingo",
  simulated: false,
  async receiveAddress() {
    const ua = process.env.ZCASH_RECEIVE_UA;
    if (!ua) throw new Error("ZCASH_RECEIVE_UA is not set");
    return ua;
  },
  async poll() {
    throw new Error("zingo backend not implemented yet");
  },
};
