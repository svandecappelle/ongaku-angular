import { VuMetter } from './level-vumetter';

export class VuMetterModern implements VuMetter {

    private context;
    private value = 0;

    private position = 'LEFT';

    // Settings
    private max = 100;
    private boxCount = 10;
    private boxCountRed = 2;
    private boxCountYellow = 3;
    private boxGapFraction = 0.1;
    private jitter = 0;

    // Colours
    private redOn = 'rgba(255,47,30,0.9)';
    private redOff = 'rgba(64,12,8,0.9)';
    private yellowOn = 'rgba(255,215,5,0.9)';
    private yellowOff = 'rgba(64,53,0,0.9)';
    //    private greenOn = 'rgba(53,255,30,0.9)';
    //    private greenOff = 'rgba(13,64,8,0.9)';

    private greenOn = 'rgba(0, 255, 231, 0.9)';
    private greenOff = 'rgba(28, 79, 74, 0.9)';

    // Derived and starting values
    private width = 200;
    private height = 63;
    private pad = 50;
    private curVal = 0;

    // Gap between boxes and box height
    private circleRadius = 3;
    private boxGapY = this.circleRadius * 2 * this.boxGapFraction;

    constructor(context, position) {
        this.context = context;
        this.position = position;
    }

    setValue(value) {
        this.value = value;
        this.draw();
    }
    // Main draw loop
    draw() {
        var targetVal = this.value;

        // Gradual approach
        if (this.curVal <= targetVal) {
            this.curVal += (targetVal - this.curVal) / 5;
        } else {
            this.curVal -= (this.curVal - targetVal) / 5;
        }

        // Apply jitter
        if (this.jitter > 0 && this.curVal > 0) {
            var amount = (Math.random() * this.jitter * this.max);
            if (Math.random() > 0.5) {
                amount = -amount;
            }
            this.curVal += amount;
        }
        if (this.curVal < 0) {
            this.curVal = 0;
        }

        this.context.save();
        this.context.beginPath();
        this.context.rect(0, 0, this.width + this.pad, this.height);
        this.context.fillStyle = 'rgb(32,32,32)';
        this.context.fill();
        this.context.restore();
        this.drawCircles(this.curVal);
    };

    // Draw the boxes
    drawCircles(val) {
        this.context.moveTo(0, 0.5);
        this.context.save();
        if (this.position === 'LEFT') {
            this.context.translate(0, this.circleRadius + 2);
        } else if (this.position === 'RIGHT') {
            this.context.translate(this.width + this.pad - (this.circleRadius * 2), this.circleRadius + 2);
        }
        var colors = [];

        for (var i = 0; i < this.boxCount; i++) {
            var id = this.getId(i);

            this.context.beginPath();
            if (this.isOn(id, val)) {
                this.context.shadowBlur = 10;
                this.context.shadowColor = this.getBoxColor(id, val);
            }
            this.context.arc(this.circleRadius, 0, this.circleRadius, 0, 2 * Math.PI, false);
            const color = this.getBoxColor(id, val);
            colors.push(color);

            this.context.fillStyle = color;
            this.context.fill();

            if (this.position === 'LEFT') {
                this.context.translate(this.circleRadius * 8, this.circleRadius * 2);
            } else if (this.position === 'RIGHT') {
                this.context.translate(-(this.circleRadius * 8), this.circleRadius * 2);
            }
        }
        this.context.restore();
        this.context.globalAlpha  = 0.5;
        this.context.lineWidth = 0.3;
        for (var i = 0; i < this.boxCount - 1; i++) {
            this.context.beginPath();
            if (this.position === 'LEFT') {
                this.context.moveTo((i + 1) * this.circleRadius * 8 - (this.pad / 4), i * this.circleRadius * 2 + 4.5);
                this.context.lineTo(this.width + (this.pad / 2), i * this.circleRadius * 2 + 4.5);
            } else if (this.position === 'RIGHT') {
                this.context.moveTo(this.width + this.pad - ((i + 1) * this.circleRadius * 8) + (this.pad / 4), i * this.circleRadius * 2 + 4.5);
                this.context.lineTo(this.pad / 2, i * this.circleRadius * 2 + 4.5);
            }
            this.context.strokeStyle = "rgba(255,255,255,0.5)";
            this.context.stroke();
            this.context.save();
            this.context.restore();
        }
        this.context.fillStyle = "white";
        if (this.position === 'LEFT') {
            this.context.fillText("d", this.width + this.pad - this.context.measureText("d").width, this.height / 2);
        } else if (this.position === 'RIGHT') {
            this.context.fillText("b", 0, this.height / 2);
        }
        this.context.save();
        this.context.translate(0, -3);
        this.context.restore();
    }

    // Get the color of a box given it's ID and the current value
    getBoxColor(id, val) {
        // on colours
        if (id > this.boxCount - this.boxCountRed) {
            return this.isOn(id, val) ? this.redOn : this.redOff;
        }
        if (id > this.boxCount - this.boxCountRed - this.boxCountYellow) {
            return this.isOn(id, val) ? this.yellowOn : this.yellowOff;
        }
        return this.isOn(id, val) ? this.greenOn : this.greenOff;
    }

    getId(index) {
        // The ids are flipped, so zero is at the top and
        // boxCount-1 is at the bottom. The values work
        // the other way around, so align them first to
        // make things easier to think about.
        return Math.abs(index - (this.boxCount - 1)) + 1;
    }

    isOn(id, val) {
        // We need to scale the input value (0-max)
        // so that it fits into the number of boxes
        var maxOn = Math.ceil((val / this.max) * this.boxCount);
        return (id <= maxOn);
    }
}