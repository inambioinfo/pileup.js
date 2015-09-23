/**
 * Visualization of genes, including exons and coding regions.
 * @flow
 */
'use strict';

var React = require('./react-shim'),
    _ = require('underscore'),
    d3 = require('d3'),
    shallowEquals = require('shallow-equals'),
    types = require('./react-types'),
    bedtools = require('./bedtools'),
    Interval = require('./Interval'),
    d3utils = require('./d3utils'),
    ContigInterval = require('./ContigInterval'),
    dataCanvas = require('./data-canvas');


// D3 function to hide overlapping elements in a selection.
// nb: this is O(n^2) in the number of transcripts on-screen.
// TODO: move into a d3utils module
var PADDING = 10;  // empty pixels to require around each element.

function drawArrow(ctx: CanvasRenderingContext2D, clampedScale: (x: number)=>number, range: Interval, tipY: number) {
  var x1 = clampedScale(range.start),
      x2 = clampedScale(range.stop);
  if (x1 != x2) {
    var cx = (x1 + x2) / 2;
    ctx.beginPath();
    ctx.moveTo(cx + 4, tipY - 4);
    ctx.lineTo(cx, tipY);
    ctx.lineTo(cx + 4, tipY + 4);
    ctx.stroke();
  }
}

var GeneTrack = React.createClass({
  displayName: 'genes',
  propTypes: {
    range: types.GenomeRange.isRequired,
    source: React.PropTypes.object.isRequired,
    onRangeChange: React.PropTypes.func.isRequired,
  },
  getInitialState: function() {
    return {
      genes: ([]: Object[])  // TODO: import Gene type from BigBedDataSource
    };
  },
  render: function(): any {
    return <div><canvas ref='canvas' /></div>;
  },
  componentDidMount: function() {
    var div = this.getDOMNode();

    // Visualize new reference data as it comes in from the network.
    this.props.source.on('newdata', () => {
      var range = this.props.range,
          ci = new ContigInterval(range.contig, range.start, range.stop);
      this.setState({
        genes: this.props.source.getGenesInRange(ci)
      });
    });

    this.updateVisualization();
  },

  getContext(): CanvasRenderingContext2D {
    var canvas = (this.refs.canvas.getDOMNode() : HTMLCanvasElement);
    // The typecast through `any` is because getContext could return a WebGL context.
    var ctx = ((canvas.getContext('2d') : any) : CanvasRenderingContext2D);
    return ctx;
  },
  getScale: function() {
    return d3utils.getTrackScale(this.props.range, this.props.width);
  },
  componentDidUpdate: function(prevProps: any, prevState: any) {
    if (!shallowEquals(prevProps, this.props) ||
        !shallowEquals(prevState, this.state)) {
      this.updateVisualization();
    }
  },
  updateVisualization: function() {
    var canvas = (this.refs.canvas.getDOMNode() : HTMLCanvasElement),
        width = this.props.width,
        height = this.props.height;

    // Hold off until height & width are known.
    if (width === 0) return;

    var scale = this.getScale(),
        // We can't clamp scale directly because of offsetPx.
        clampedScale = d3.scale.linear()
            .domain([scale.invert(0), scale.invert(width)])
            .range([0, width])
            .clamp(true);

    d3.select(canvas).attr({width, height});

    var ctx = dataCanvas.getDataContext(this.getContext());
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    var geneLineY = height / 4;
    this.state.genes.forEach(gene => {
      ctx.pushObject(gene);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'blue';
      ctx.fillStyle = 'blue';
      ctx.beginPath();
      ctx.moveTo(clampedScale(gene.position.start()), geneLineY);
      ctx.lineTo(clampedScale(gene.position.stop()), geneLineY);
      ctx.stroke();

      // TODO: only compute all these intervals when data becomes available.
      var exons = bedtools.splitCodingExons(gene.exons, gene.codingRegion);
      exons.forEach(exon => {
        ctx.fillRect(scale(exon.start),
                     geneLineY - 3 * (exon.isCoding ? 2 : 1),
                     scale(exon.stop + 1) - scale(exon.start),
                     6 * (exon.isCoding ? 2 : 1));
      });

      ctx.strokeStyle = 'blue';
      var introns = gene.position.interval.complementIntervals(gene.exons);
      introns.forEach(range => {
        drawArrow(ctx, clampedScale, range, geneLineY);
      });
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      gene.exons.forEach(range => {
        drawArrow(ctx, clampedScale, range, geneLineY);
      });

      var p = gene.position,
          centerX = 0.5 * (clampedScale(p.start()) + clampedScale(p.stop()));
      ctx.fillText(gene.name || gene.id, centerX, geneLineY + 15);
      ctx.popObject();
    });
  }
});

module.exports = GeneTrack;
