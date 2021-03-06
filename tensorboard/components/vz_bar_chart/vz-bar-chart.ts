/* Copyright 2015 The TensorFlow Authors. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
==============================================================================*/
namespace vz_bar_chart {

/**
 * Encapsulates information for a single bar to rendered onto the chart.
 */
export interface Bar {
  // The label on the X-axis for this bar.
  x: string,

  // The height of the bar.
  y: number,
}

Polymer({
  is: 'vz-bar-chart',
  properties: {
    /**
     * How to feed data to the bar chart.
     *
     * Each key within the `data` object corresponds to a data series,
     * each of which is associated with its own color of bars.
     *
     * Each entry within a list corresponds to an X-axis label (the string
     * 'x' property) and bar height (The numeric 'y' property).
     *
     * Example:
     * data = {'series0':[{ x: 'a', y: 1 }, { x: 'c', y: 3 }, { x: 'b', y: 2 }],
     *        'series1':[{ x: 'a', y: 4 }, { x: 'g', y: 3 }, { x: 'e', y: 5 }]}
     *
     * This will generate a Plottable ClusteredBar chart with two series and
     * 5 distinct classes ('a', 'b', 'c', 'g', 'e').
     */
    data: Object,

    /**
     * Scale that maps series names to colors. The default colors are from
     * d3.schemeCategory10. Use this property to replace the default coloration.
     *
     * Note that if a `colorScale` gets passed in, it gets mutated within this
     * component to have its domain set to the sorted keys of the `data` object.
     * e.g. .domain(['series0', 'series1'])
     * @type {Plottable.Scales.Color}
     */
    colorScale: {
      type: Object,
      value: function() {
        return new Plottable.Scales.Color().range(d3.schemeCategory10);
      }
    },

    /**
     * How to format the tooltip.
     *
     * There should be a formatting object for each desired column.
     * Each formatting object gets applied to the datum bound to the closest
     * clustered bar.
     */
    tooltipColumns: {
      type: Array,
      value: function() {
        return [
          {
            title: 'Name',
            evaluate: function(d) {
              return d.key;
            },
          },
          {
            title: 'X',
            evaluate: function(d) {
              return d.value.x;
            },
          },
          {
            title: 'Y',
            evaluate: function(d) {
              return d.value.y;
            },
          },
        ];
      }
    },
    _attached: Boolean,
    _chart: Object,
  },
  observers: [
    '_makeChart(data, colorScale, tooltipColumns, _attached)',
    '_createTooltipHeaders(tooltipColumns)',
  ],
  _createTooltipHeaders(tooltipColumns) {
    d3.select("#tooltip-table-header-row")
        .selectAll('th')
        .data(tooltipColumns)
        .enter()
        .append('th')
        .text(d => d.title);
  },
  /**
   * Re-renders the chart. Useful if e.g. the container size changed.
   */
  redraw: function() {
    if (this._chart) {
      this._chart.redraw();
    }
  },
  attached: function() {
    this._attached = true;
  },
  detached: function() {
    this._attached = false;
  },
  ready: function() {
    // This is needed so Polymer can apply the CSS styles to elements we
    // created with d3.
    this.scopeSubtree(this.$.tooltip, true);
    this.scopeSubtree(this.$.chartdiv, true);
  },
  /**
   * Creates a chart, and asynchronously renders it. Fires a chart-rendered
   * event after the chart is rendered.
   */
  _makeChart: function(data, colorScale, tooltipColumns, _attached) {
    if (this._chart) this._chart.destroy();
    var tooltip = d3.select(this.$.tooltip);
    // We directly reference properties of `this` because this call is
    // asynchronous, and values may have changed in between the call being
    // initiated and actually being run.
    var chart =
        new BarChart(this.data, this.colorScale, tooltip, this.tooltipColumns);
    var div = d3.select(this.$.chartdiv);
    chart.renderTo(div);
    this._chart = chart;
  },
  _computeTooltipTableHeaderHtml: function(tooltipColumns) {
    // The first column contains the circle with the color of the run.
    var titles = [''].concat(_.map(tooltipColumns, 'title'));
    return titles
        .map(function(title) {
          return '<th>' + title + '</th>';
        })
        .join('');
  },
});

class BarChart {
  private data: {[key: string]: (Bar[])};
  private colorScale: Plottable.Scales.Color;
  private tooltip: d3.Selection<any, any, any, any>;
  private outer: Plottable.Components.Table;
  private plot: Plottable.Plots.ClusteredBar<string, number>;
  private targetSVG: d3.Selection<any, any, any, any>;

  constructor(
      data: {[key: string]: (Bar[])},
      colorScale: Plottable.Scales.Color,
      tooltip: d3.Selection<any, any, any, any>,
      tooltipColumns: vz_chart_helpers.TooltipColumn[]) {
    // Assign each class a color.
    colorScale.domain(_.sortBy(_.keys(data)));

    // Assign arguments passed in constructor for future use.
    this.data = data;
    this.colorScale = colorScale;
    this.tooltip = tooltip;

    this.plot = null;
    this.outer = null;

    // Do things to actually build the chart.
    this.buildChart(data, colorScale);
    this.setupTooltips(tooltipColumns);
  }

  private buildChart(
      data: {[key: string]: (Bar[])},
      colorScale: Plottable.Scales.Color) {
    if (this.outer) {
      this.outer.destroy();
    }

    const xScale = new Plottable.Scales.Category();
    const yScale = new Plottable.Scales.Linear();

    const xAxis = new Plottable.Axes.Category(xScale, 'bottom');
    const yAxis = new Plottable.Axes.Numeric(yScale, 'left');

    const plot = new Plottable.Plots.ClusteredBar<string, number>();
    plot.x(function(d) {
      return d.x;
    }, xScale);
    plot.y(function(d) {
      return d.y;
    }, yScale);

    const seriesNames = _.keys(data);
    seriesNames.forEach(
        seriesName => plot.addDataset(
            new Plottable.Dataset(data[seriesName]).metadata(seriesName)));
    plot.attr('fill', function(d, i, dataset) {
      return colorScale.scale(dataset.metadata());
    });

    this.plot = plot;
    this.outer = new Plottable.Components.Table(
        [[yAxis, plot], [null, xAxis]]);
  }

  private setupTooltips(tooltipColumns: vz_chart_helpers.TooltipColumn[]) {
    const plot = this.plot;
    const pointer = new Plottable.Interactions.Pointer();
    pointer.attachTo(plot);

    var hideTooltips = () => {
      this.tooltip.style('opacity', 0);
    };
    pointer.onPointerMove((p) => {
      const target = plot.entityNearest(p);
      if (target) {
        this.drawTooltips(target, tooltipColumns);
      }
    });
    pointer.onPointerExit(hideTooltips);
  }

  private drawTooltips(
      target: Plottable.Plots.IPlotEntity,
      tooltipColumns: vz_chart_helpers.TooltipColumn[]) {
    const hoveredClass = target.datum.x;

    // The data is formatted in the way described on the  main element.
    // e.g. {'series0': [{ x: 'a', y: 1 }, { x: 'c', y: 3 },
    //       'series1': [{ x: 'a', y: 4 }, { x: 'g', y: 3 }, { x: 'e', y: 5 }]}

    // Filter down the data so each value contains 0 or 1 elements in the array,
    // which correspond to the value of the closest clustered bar (e.g. 'c').
    // This generates {series0: Array(1), series1: Array(0)}.
    let points = _.mapValues(
        this.data,
        allValuesForSeries =>
            _.filter(allValuesForSeries, elt => elt.x == hoveredClass));

    // Remove the keys that map to an empty array, and unpack the array.
    // This generates {series0: { x: 'c', y: 3 }}
    points = _.pick(points, val => val.length > 0);
    const singlePoints = _.mapValues(points, val => val[0]);

    // Rearrange the object for convenience.
    // This yields: [{key: 'series0', value: { x: 'c', y: 3 }}, ]
    const formattedPoints = d3.entries(singlePoints);

    // Bind the points data structure to the tooltip.
    const rows = this.tooltip.select('tbody')
                   .html('')
                   .selectAll('tr')
                   .data(formattedPoin ts)
                   .enter()
                   .append('tr');

    rows.style('white-space', 'nowrap');
    const colorScale = this.colorScale;
    rows.append('td')
        .append('div')
        .classed('swatch', true)
        .style('background-color', d => colorScale.scale(d.key));
    _.each(tooltipColumns, (column) => {
      rows.append('td').text((d) => {
        // TypeScript cannot detect the type of data bound to the elements.
        const point = d as any as vz_chart_helpers.Point;
        return column.evaluate(point);
      });
    });

    const left = target.position.x;
    const top = target.position.y;
    this.tooltip.style('transform', 'translate(' + left + 'px,' + top + 'px)');
    this.tooltip.style('opacity', 1);
  }

  public renderTo(targetSVG: d3.Selection<any, any, any, any>) {
    // TODO(chihuahua): Figure out why we store targetSVG as a property.
    this.targetSVG = targetSVG;
    this.outer.renderTo(targetSVG);
  }

  public redraw() {
    this.outer.redraw();
  }

  public destroy() {
    this.outer.destroy();
  }
}

} // namespace vz_bar_chart
