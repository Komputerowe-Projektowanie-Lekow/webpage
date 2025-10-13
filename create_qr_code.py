import qrcode
from qrcode.constants import ERROR_CORRECT_Q
from qrcode.image.svg import SvgImage

url = "https://komputerowe-projektowanie-lekow.github.io/webpage/"
qr = qrcode.QRCode(
    version=None,                # automatyczny rozmiar
    error_correction=ERROR_CORRECT_Q,
    box_size=10, border=4       # zachowaj ramkę (quiet zone)
)
qr.add_data(url)
qr.make(fit=True)
img = qr.make_image(image_factory=SvgImage)   # albo bez image_factory dla PNG
img.save("sknwpl.svg")