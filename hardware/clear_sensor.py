import serial
import adafruit_fingerprint

# UART configuration for Raspberry Pi GPIO pins
uart = serial.Serial("/dev/serial0", baudrate=57600, timeout=1)
finger = adafruit_fingerprint.Adafruit_Fingerprint(uart)

def clear_sensor():
    print("WARNING: This will permanently delete ALL enrolled fingerprints from the sensor's hardware memory.")
    confirm = input("Are you sure you want to proceed? (yes/no): ")
    
    if confirm.lower() == 'yes':
        print("Erasing all fingerprints...")
        if finger.empty_library() == adafruit_fingerprint.OK:
            print("✅ Sensor memory completely wiped! It is now a blank slate.")
        else:
            print("❌ Failed to wipe sensor memory.")
    else:
        print("Aborted.")

if __name__ == '__main__':
    clear_sensor()
