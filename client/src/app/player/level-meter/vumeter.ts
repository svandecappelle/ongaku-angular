
export class VuMetter {

    private context;
    private value = 0;

    // Settings
    private max = 100;
    private boxCount = 10;
    private boxCountRed = 2;
    private boxCountYellow = 3;
    private boxGapFraction = 0.2;
    private jitter = 0;

    // Colours
    private redOn = 'rgba(255,47,30,0.9)';
    private redOff = 'rgba(64,12,8,0.9)';
    private yellowOn = 'rgba(255,215,5,0.9)';
    private yellowOff = 'rgba(64,53,0,0.9)';
    private greenOn = 'rgba(53,255,30,0.9)';
    private greenOff = 'rgba(13,64,8,0.9)';

    // Derived and starting values
    private width = 25;
    private height = 60;
    private curVal = 0;

    // Gap between boxes and box height
    private boxHeight = this.height / (this.boxCount + (this.boxCount + 1) * this.boxGapFraction);
    private boxGapY = this.boxHeight * this.boxGapFraction;

    private boxWidth = this.width - (this.boxGapY * 2);
    private boxGapX = (this.width - this.boxWidth) / 2;

    constructor(context) {
        this.context = context;
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
        this.context.rect(0, 0, this.width, this.height);
        this.context.fillStyle = 'rgb(32,32,32)';
        this.context.fill();
        this.context.restore();
        this.drawBoxes(this.curVal);
    };

    // Draw the boxes
    drawBoxes(val) {
        this.context.save();
        this.context.translate(this.boxGapX, this.boxGapY);
        for (var i = 0; i < this.boxCount; i++) {
            var id = this.getId(i);

            this.context.beginPath();
            if (this.isOn(id, val)) {
                this.context.shadowBlur = 10;
                this.context.shadowColor = this.getBoxColor(id, val);
            }
            this.context.rect(0, 0, this.boxWidth, this.boxHeight);
            this.context.fillStyle = this.getBoxColor(id, val);
            this.context.fill();
            this.context.translate(0, this.boxHeight + this.boxGapY);
        }
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