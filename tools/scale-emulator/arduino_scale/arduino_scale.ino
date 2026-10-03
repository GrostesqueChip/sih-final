// USB weighing-indicator emulator for any Arduino-compatible board (Uno, Nano, Leonardo, ESP32, Pi Pico).
// Plug the board into the PC: it appears as a real USB serial device, so Chrome / Edge lists it in the
// Web Serial port picker exactly like a scale's USB port. No driver or virtual-port software is needed.
//
// It streams Mettler-Toledo MT-SICS frames at 9600 8N1:  "S S     12.345 kg"  (stable)  /  "S D ..." (in motion).
// Optional: wire a 10k potentiometer to A0 to act as the load; without it the board steps through the
// OIML R 76 weighing sequence (0, 20, 40, 60, 80, 100 % of Max, then back down) every 4 seconds.

const float MAX_KG = 30.0;      // Max
const float E_KG = 0.005;       // verification scale interval e
const bool USE_POT = false;     // true if a potentiometer is on A0

const float STEPS[] = {0, 0.2, 0.4, 0.6, 0.8, 1.0, 0.8, 0.6, 0.4, 0.2, 0};
const int N_STEPS = sizeof(STEPS) / sizeof(STEPS[0]);

float target = 0, value = 0;
int stepIndex = 0, stillCount = 0;
unsigned long stepAt = 0;

void setup() {
  Serial.begin(9600);
  randomSeed(analogRead(A1));
}

void loop() {
  if (USE_POT) {
    target = MAX_KG * analogRead(A0) / 1023.0;
  } else if (millis() - stepAt > 4000) {
    stepIndex = (stepIndex + 1) % N_STEPS;
    target = MAX_KG * STEPS[stepIndex];
    stepAt = millis();
  }

  // first-order settling towards the load, with noise that dies down once settled
  float gap = target - value;
  value += gap * 0.35;
  float noise = (random(-100, 101) / 100.0) * E_KG * (fabs(gap) > E_KG ? 1.5 : 0.1);
  float shown = round((value + noise) / E_KG) * E_KG;
  if (fabs(shown) < E_KG / 2) shown = 0;   // avoid "-0.000"

  bool moving = fabs(gap) > E_KG * 0.6;
  stillCount = moving ? 0 : stillCount + 1;
  bool stable = stillCount >= 3;

  // MT-SICS answers the host's zero command
  if (Serial.available() && Serial.read() == 'Z') { value = 0; target = 0; Serial.print("Z A\r\n"); }

  char num[12];
  dtostrf(shown, 10, 3, num);   // right-aligned, 3 decimals
  Serial.print(stable ? "S S " : "S D ");
  Serial.print(num);
  Serial.print(" kg\r\n");
  delay(200);                    // 5 frames per second
}
