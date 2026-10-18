# Idtra Web SDK (Biometric KYC & Active Liveness)

Official JavaScript/TypeScript SDK for embedding **Idtra Biometric Face Verification** and **Active Liveness Detection** into web applications.

Features:
- 🛡️ **Anti-Spoofing & Active Liveness**: Prevents presentation attacks, printed photos, and screen playback.
- ⚡ **1:1 Facial Comparison**: Matches live selfies against official Nigerian government databases (**NIMC NIN** and **BVN**).
- 📲 **Cross-Device Support**: Works across desktop webcams and mobile browsers (iOS Safari & Android Chrome).
- 🎨 **Sleek HUD Viewport**: Built-in cybernetic framing with intuitive user guidance and challenge prompts.

---

## 1. Quick Start via CDN (No Build Step)

Include the SDK script tag in your HTML:

```html
<script src="https://idtra.com/sdk/idtra-kyc.js"></script>

<button onclick="verifyIdentity()">Verify Identity with Face</button>

<script>
function verifyIdentity() {
    IdtraKYC.start({
        nin: "12345678901",                 // 11-digit NIN (or use 'bvn')
        apiKey: "YOUR_IDTRA_API_KEY",       // From https://idtra.com/dashboard/apikeys
        onComplete: function(response) {
            console.log("Verified:", response);
            alert("Match confirmed: " + response.data.firstname + " " + response.data.surname);
        },
        onError: function(error) {
            console.error("Verification failed:", error);
            alert("Verification Failed: " + error.message);
        },
        onClose: function() {
            console.log("User closed verification modal.");
        }
    });
}
</script>
```

---

## 2. Install via NPM / Yarn

```bash
npm install @idtra/web-sdk
# or
yarn add @idtra/web-sdk
```

### Usage with React, Vue, or Next.js:

```typescript
import { IdtraKYC } from '@idtra/web-sdk';

const handleVerify = () => {
  IdtraKYC.start({
    nin: "12345678901",
    apiKey: process.env.NEXT_PUBLIC_IDTRA_API_KEY,
    onComplete: (res) => {
      if (res.face_match?.is_match) {
        console.log("Confidence:", res.face_match.confidence);
        console.log("Official Photo:", res.data.photo);
      }
    },
    onError: (err) => {
      console.error(err);
    }
  });
};
```

---

## Configuration Options

| Option | Type | Required | Description |
|---|---|---|---|
| `nin` | `string` | Optional* | 11-digit National Identity Number. (*Either `nin` or `bvn` required) |
| `bvn` | `string` | Optional* | 11-digit Bank Verification Number. |
| `apiKey` | `string` | Required | Your Idtra API Key (`sk_live_...`). |
| `endpoint` | `string` | Optional | Custom proxy endpoint (defaults to Idtra production API). |
| `onComplete` | `function` | Required | Callback when facial verification succeeds. |
| `onError` | `function` | Required | Callback when match fails or an error occurs. |
| `onClose` | `function` | Optional | Callback when modal is dismissed by user. |

---

## License

MIT © [Idtra Technologies Ltd](https://idtra.com)
