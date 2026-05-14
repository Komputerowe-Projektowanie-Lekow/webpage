import qrcode
from qrcode.constants import ERROR_CORRECT_Q
from qrcode.image.svg import SvgImage


def save_qr(url, output_path):
    qr = qrcode.QRCode(
        version=None,
        error_correction=ERROR_CORRECT_Q,
        box_size=10,
        border=4,
    )
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(image_factory=SvgImage)
    img.save(output_path)


save_qr(
    "https://komputerowe-projektowanie-lekow.github.io/webpage/",
    "sknwpl.svg",
)
save_qr(
    "https://github.com/Komputerowe-Projektowanie-Lekow/PROTO-NOOS-ML",
    "gub-ml-github-qr.svg",
)
save_qr(
    "https://komputerowe-projektowanie-lekow.github.io/webpage/proto-noos.html",
    "proto-noos-page-qr.svg",
)
