namespace lineTracingForPowerbrick {

    const PCA9685_ADDRESS = 0x40
    const MODE1 = 0x00
    const MODE2 = 0x01
    const SUBADR1 = 0x02
    const SUBADR2 = 0x03
    const SUBADR3 = 0x04
    const PRESCALE = 0xFE
    const LED0_ON_L = 0x06
    const LED0_ON_H = 0x07
    const LED0_OFF_L = 0x08
    const LED0_OFF_H = 0x09
    const ALL_LED_ON_L = 0xFA
    const ALL_LED_ON_H = 0xFB
    const ALL_LED_OFF_L = 0xFC
    const ALL_LED_OFF_H = 0xFD

    let initialized = false

    const PortDigi = [
        [DigitalPin.P8, DigitalPin.P0],
        [DigitalPin.P12, DigitalPin.P1],
        [DigitalPin.P13, DigitalPin.P2],
        [DigitalPin.P15, DigitalPin.P14],
        [DigitalPin.P6, DigitalPin.P3],
        [DigitalPin.P7, DigitalPin.P4],
        [DigitalPin.P9, DigitalPin.P10]
    ]

    export enum Ports {
        PORT1 = 0,
        PORT2 = 1,
        PORT3 = 2,
        PORT4 = 3,
        PORT5 = 4,
        PORT6 = 5,
        PORT7 = 6
    }

    export enum Slots {
        A = 1, // inverse slot by zp
        B = 0
    }

    export enum Motors {
        M1 = 0x1,
        M2 = 0x2
    }

    function i2cwrite(addr: number, reg: number, value: number) {
        let buf = pins.createBuffer(2)
        buf[0] = reg
        buf[1] = value
        pins.i2cWriteBuffer(addr, buf)
    }

    function i2ccmd(addr: number, value: number) {
        let buf2 = pins.createBuffer(1)
        buf2[0] = value
        pins.i2cWriteBuffer(addr, buf2)
    }


    function i2cread(addr: number, reg: number) {
        pins.i2cWriteNumber(addr, reg, NumberFormat.UInt8BE);
        let val = pins.i2cReadNumber(addr, NumberFormat.UInt8BE);
        return val;
    }

    function setFreq(freq: number): void {
        // Constrain the frequency
        let prescaleval = 25000000;
        prescaleval /= 4096;
        prescaleval /= freq;
        prescaleval -= 1;
        let prescale = prescaleval; //Math.Floor(prescaleval + 0.5);
        let oldmode = i2cread(PCA9685_ADDRESS, MODE1);
        let newmode = (oldmode & 0x7F) | 0x10; // sleep
        i2cwrite(PCA9685_ADDRESS, MODE1, newmode); // go to sleep
        i2cwrite(PCA9685_ADDRESS, PRESCALE, prescale); // set the prescaler
        i2cwrite(PCA9685_ADDRESS, MODE1, oldmode);
        control.waitMicros(5000);
        i2cwrite(PCA9685_ADDRESS, MODE1, oldmode | 0xa1);
    }

    function setPwm(channel: number, on: number, off: number): void {
        if (channel < 0 || channel > 15)
            return;
        let buf3 = pins.createBuffer(5);
        buf3[0] = LED0_ON_L + 4 * channel;
        buf3[1] = on & 0xff;
        buf3[2] = (on >> 8) & 0xff;
        buf3[3] = off & 0xff;
        buf3[4] = (off >> 8) & 0xff;
        pins.i2cWriteBuffer(PCA9685_ADDRESS, buf3);
    }

    function initPCA9685(): void {
        i2cwrite(PCA9685_ADDRESS, MODE1, 0x00)
        setFreq(50);
        for (let idx = 0; idx < 16; idx++) {
            setPwm(idx, 0, 0);
        }
        initialized = true
    }

    export function MotorRun(index: Motors, speed: number): void {
        if (!initialized) {
            initPCA9685()
        }
        speed = speed * 16; // map 255 to 4096
        if (speed >= 4096) {
            speed = 4095
        }
        if (speed <= -4096) {
            speed = -4095
        }
        if (index > 2 || index <= 0)
            return
        let pp = (index - 1) * 2
        let pn = (index - 1) * 2 + 1
        // serial.writeString("M " + index + " spd " + speed + " pp " + pp + " pn " + pn + "\n")
        if (speed >= 0) {
            setPwm(pp, 0, speed)
            setPwm(pn, 0, 0)
        } else {
            setPwm(pp, 0, 0)
            setPwm(pn, 0, -speed)
        }
    }


    //% blockId=custom_motor_dual block="Motor|speed %speed1|speed %speed2"
    //% weight=43
    //% speed1.min=-255 speed1.max=255
    //% speed2.min=-255 speed2.max=255
    //% group="Actuator" name.fieldEditor="gridpicker" name.fieldOptions.columns=4
    export function MotorRunDual(speed1: number, speed2: number): void {
        MotorRun(1, speed1);
        MotorRun(2, speed2);
    }

    //% blockId=custom_tracer block="Tracer|port %port|slot %slot"
    //% group="Linefollower" weight=81
    export function Tracer(port: Ports, slot: Slots): boolean {
        let pin = PortDigi[port][slot]
        pins.setPull(pin, PinPullMode.PullUp)
        return pins.digitalReadPin(pin) == 1
    }

    //% blockId=custom_tracing_line_with_motors block="MoveAlongBlackLine|port %port|speed %speed"
    //% speed.min=-255 speed.max=255
    export function TracingLineWithMotors(port: Ports, speed: number): void {
        if (Tracer(port, Slots.A) && Tracer(port, Slots.B)) {
            MotorRunDual(speed, speed)
        } else if (!(Tracer(port, Slots.A)) && Tracer(port, Slots.B)) {
            MotorRunDual(speed, -speed)
        } else if (Tracer(port, Slots.A) && !(Tracer(port, Slots.B))) {
            MotorRunDual(-speed, speed)
        } else if (!(Tracer(port, Slots.A)) && !(Tracer(port, Slots.B))) {
            MotorRunDual(-speed, -speed)
        }
    }
}
