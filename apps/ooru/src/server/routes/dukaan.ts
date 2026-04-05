import { Router } from "express";

const router = Router();

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dukaan — Ooru</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #fff; color: #1a1a2e; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; }
    .logo { font-size: 48px; font-weight: 800; color: #8B5CF6; margin-bottom: 8px; }
    .tagline { font-size: 24px; font-weight: 600; margin-bottom: 16px; text-align: center; }
    .features { font-size: 16px; color: #666; margin-bottom: 32px; text-align: center; line-height: 1.6; max-width: 400px; }
    .cta { display: inline-block; background: #25D366; color: #fff; font-size: 20px; font-weight: 700; padding: 16px 40px; border-radius: 12px; text-decoration: none; transition: transform 0.1s; }
    .cta:active { transform: scale(0.97); }
    .domain { margin-top: 24px; color: #8B5CF6; font-size: 14px; font-weight: 500; }
    .lang { margin-top: 16px; display: flex; gap: 16px; }
    .lang a { color: #8B5CF6; text-decoration: none; font-size: 14px; padding: 4px 8px; border-radius: 4px; }
    .lang a:hover { background: #f3f0ff; }
    .lang a.active { font-weight: 700; background: #f3f0ff; }
  </style>
</head>
<body>
  <div class="logo">ಊರು</div>
  <div class="tagline" id="tagline">Your business on WhatsApp. Free.</div>
  <div class="features" id="features">
    POS &bull; Udhar tracking &bull; Stock management<br>
    GST filing help &bull; Daily P&amp;L &bull; Job cards<br>
    All on WhatsApp. No app to download.
  </div>
  <a class="cta" id="cta" href="https://wa.me/919900000000?text=I+want+to+set+up+my+shop">
    Get set up via WhatsApp &rarr;
  </a>
  <div class="domain">dukaan.ooru.ai</div>
  <div class="lang">
    <a href="#" class="active" onclick="setLang('en')">English</a>
    <a href="#" onclick="setLang('kn')">ಕನ್ನಡ</a>
    <a href="#" onclick="setLang('hi')">हिंदी</a>
  </div>
  <script>
    const langs = {
      en: { tagline: 'Your business on WhatsApp. Free.', features: 'POS &bull; Udhar tracking &bull; Stock management<br>GST filing help &bull; Daily P&amp;L &bull; Job cards<br>All on WhatsApp. No app to download.', cta: 'Get set up via WhatsApp &rarr;' },
      kn: { tagline: 'ನಿಮ್ಮ ವ್ಯಾಪಾರ WhatsApp ನಲ್ಲಿ. ಉಚಿತ.', features: 'POS &bull; ಉಧಾರ ಟ್ರ್ಯಾಕಿಂಗ್ &bull; ಸ್ಟಾಕ್<br>GST &bull; ದೈನಿಕ P&amp;L &bull; ಜಾಬ್ ಕಾರ್ಡ್<br>ಎಲ್ಲವೂ WhatsApp ನಲ್ಲಿ.', cta: 'WhatsApp ನಲ್ಲಿ ಸೆಟಪ್ ಮಾಡಿ &rarr;' },
      hi: { tagline: 'आपका बिज़नेस WhatsApp पर. फ्री.', features: 'POS &bull; उधार ट्रैकिंग &bull; स्टॉक<br>GST &bull; दैनिक P&amp;L &bull; जॉब कार्ड<br>सब WhatsApp पर. कोई ऐप नहीं.', cta: 'WhatsApp पर सेटअप करें &rarr;' }
    };
    function setLang(l) {
      document.getElementById('tagline').textContent = langs[l].tagline;
      document.getElementById('features').innerHTML = langs[l].features;
      document.getElementById('cta').innerHTML = langs[l].cta;
      document.querySelectorAll('.lang a').forEach(a => a.classList.remove('active'));
      event.target.classList.add('active');
    }
  </script>
</body>
</html>`;

router.get("/", (_req, res) => {
  res.type("html").send(HTML);
});

export default router;
