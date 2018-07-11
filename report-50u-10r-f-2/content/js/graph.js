/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
    $(".portlet-header").css("cursor", "auto");
});

var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

// Fixes time stamps
function fixTimeStamps(series, offset){
    $.each(series, function(index, item) {
        $.each(item.data, function(index, coord) {
            coord[0] += offset;
        });
    });
}

// Check if the specified jquery object is a graph
function isGraph(object){
    return object.data('plot') !== undefined;
}

/**
 * Export graph to a PNG
 */
function exportToPNG(graphName, target) {
    var plot = $("#"+graphName).data('plot');
    var flotCanvas = plot.getCanvas();
    var image = flotCanvas.toDataURL();
    image = image.replace("image/png", "image/octet-stream");
    
    var downloadAttrSupported = ("download" in document.createElement("a"));
    if(downloadAttrSupported === true) {
        target.download = graphName + ".png";
        target.href = image;
    }
    else {
        document.location.href = image;
    }
    
}

// Override the specified graph options to fit the requirements of an overview
function prepareOverviewOptions(graphOptions){
    var overviewOptions = {
        series: {
            shadowSize: 0,
            lines: {
                lineWidth: 1
            },
            points: {
                // Show points on overview only when linked graph does not show
                // lines
                show: getProperty('series.lines.show', graphOptions) == false,
                radius : 1
            }
        },
        xaxis: {
            ticks: 2,
            axisLabel: null
        },
        yaxis: {
            ticks: 2,
            axisLabel: null
        },
        legend: {
            show: false,
            container: null
        },
        grid: {
            hoverable: false
        },
        tooltip: false
    };
    return $.extend(true, {}, graphOptions, overviewOptions);
}

// Force axes boundaries using graph extra options
function prepareOptions(options, data) {
    options.canvas = true;
    var extraOptions = data.extraOptions;
    if(extraOptions !== undefined){
        var xOffset = options.xaxis.mode === "time" ? 28800000 : 0;
        var yOffset = options.yaxis.mode === "time" ? 28800000 : 0;

        if(!isNaN(extraOptions.minX))
        	options.xaxis.min = parseFloat(extraOptions.minX) + xOffset;
        
        if(!isNaN(extraOptions.maxX))
        	options.xaxis.max = parseFloat(extraOptions.maxX) + xOffset;
        
        if(!isNaN(extraOptions.minY))
        	options.yaxis.min = parseFloat(extraOptions.minY) + yOffset;
        
        if(!isNaN(extraOptions.maxY))
        	options.yaxis.max = parseFloat(extraOptions.maxY) + yOffset;
    }
}

// Filter, mark series and sort data
/**
 * @param data
 * @param noMatchColor if defined and true, series.color are not matched with index
 */
function prepareSeries(data, noMatchColor){
    var result = data.result;

    // Keep only series when needed
    if(seriesFilter && (!filtersOnlySampleSeries || result.supportsControllersDiscrimination)){
        // Insensitive case matching
        var regexp = new RegExp(seriesFilter, 'i');
        result.series = $.grep(result.series, function(series, index){
            return regexp.test(series.label);
        });
    }

    // Keep only controllers series when supported and needed
    if(result.supportsControllersDiscrimination && showControllersOnly){
        result.series = $.grep(result.series, function(series, index){
            return series.isController;
        });
    }

    // Sort data and mark series
    $.each(result.series, function(index, series) {
        series.data.sort(compareByXCoordinate);
        if(!(noMatchColor && noMatchColor===true)) {
	        series.color = index;
	    }
    });
}

// Set the zoom on the specified plot object
function zoomPlot(plot, xmin, xmax, ymin, ymax){
    var axes = plot.getAxes();
    // Override axes min and max options
    $.extend(true, axes, {
        xaxis: {
            options : { min: xmin, max: xmax }
        },
        yaxis: {
            options : { min: ymin, max: ymax }
        }
    });

    // Redraw the plot
    plot.setupGrid();
    plot.draw();
}

// Prepares DOM items to add zoom function on the specified graph
function setGraphZoomable(graphSelector, overviewSelector){
    var graph = $(graphSelector);
    var overview = $(overviewSelector);

    // Ignore mouse down event
    graph.bind("mousedown", function() { return false; });
    overview.bind("mousedown", function() { return false; });

    // Zoom on selection
    graph.bind("plotselected", function (event, ranges) {
        // clamp the zooming to prevent infinite zoom
        if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
            ranges.xaxis.to = ranges.xaxis.from + 0.00001;
        }
        if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
            ranges.yaxis.to = ranges.yaxis.from + 0.00001;
        }

        // Do the zooming
        var plot = graph.data('plot');
        zoomPlot(plot, ranges.xaxis.from, ranges.xaxis.to, ranges.yaxis.from, ranges.yaxis.to);
        plot.clearSelection();

        // Synchronize overview selection
        overview.data('plot').setSelection(ranges, true);
    });

    // Zoom linked graph on overview selection
    overview.bind("plotselected", function (event, ranges) {
        graph.data('plot').setSelection(ranges);
    });

    // Reset linked graph zoom when reseting overview selection
    overview.bind("plotunselected", function () {
        var overviewAxes = overview.data('plot').getAxes();
        zoomPlot(graph.data('plot'), overviewAxes.xaxis.min, overviewAxes.xaxis.max, overviewAxes.yaxis.min, overviewAxes.yaxis.max);
    });
}

var responseTimePercentilesInfos = {
        data: {"result": {"minY": 38.0, "minX": 0.0, "maxY": 60193.0, "series": [{"data": [[0.0, 38.0], [0.1, 40.0], [0.2, 41.0], [0.3, 42.0], [0.4, 42.0], [0.5, 43.0], [0.6, 45.0], [0.7, 47.0], [0.8, 50.0], [0.9, 56.0], [1.0, 61.0], [1.1, 78.0], [1.2, 86.0], [1.3, 107.0], [1.4, 116.0], [1.5, 119.0], [1.6, 128.0], [1.7, 144.0], [1.8, 159.0], [1.9, 166.0], [2.0, 169.0], [2.1, 176.0], [2.2, 182.0], [2.3, 186.0], [2.4, 188.0], [2.5, 190.0], [2.6, 193.0], [2.7, 196.0], [2.8, 198.0], [2.9, 201.0], [3.0, 204.0], [3.1, 205.0], [3.2, 207.0], [3.3, 208.0], [3.4, 209.0], [3.5, 210.0], [3.6, 212.0], [3.7, 214.0], [3.8, 216.0], [3.9, 218.0], [4.0, 219.0], [4.1, 221.0], [4.2, 223.0], [4.3, 224.0], [4.4, 225.0], [4.5, 226.0], [4.6, 229.0], [4.7, 231.0], [4.8, 232.0], [4.9, 233.0], [5.0, 235.0], [5.1, 237.0], [5.2, 239.0], [5.3, 240.0], [5.4, 241.0], [5.5, 242.0], [5.6, 243.0], [5.7, 244.0], [5.8, 246.0], [5.9, 247.0], [6.0, 249.0], [6.1, 250.0], [6.2, 252.0], [6.3, 254.0], [6.4, 255.0], [6.5, 256.0], [6.6, 258.0], [6.7, 259.0], [6.8, 260.0], [6.9, 261.0], [7.0, 263.0], [7.1, 264.0], [7.2, 266.0], [7.3, 267.0], [7.4, 269.0], [7.5, 270.0], [7.6, 271.0], [7.7, 273.0], [7.8, 274.0], [7.9, 276.0], [8.0, 277.0], [8.1, 278.0], [8.2, 279.0], [8.3, 281.0], [8.4, 282.0], [8.5, 283.0], [8.6, 286.0], [8.7, 287.0], [8.8, 288.0], [8.9, 289.0], [9.0, 290.0], [9.1, 290.0], [9.2, 292.0], [9.3, 293.0], [9.4, 295.0], [9.5, 297.0], [9.6, 298.0], [9.7, 300.0], [9.8, 301.0], [9.9, 301.0], [10.0, 303.0], [10.1, 304.0], [10.2, 305.0], [10.3, 307.0], [10.4, 308.0], [10.5, 309.0], [10.6, 310.0], [10.7, 312.0], [10.8, 313.0], [10.9, 315.0], [11.0, 316.0], [11.1, 317.0], [11.2, 318.0], [11.3, 319.0], [11.4, 320.0], [11.5, 321.0], [11.6, 322.0], [11.7, 323.0], [11.8, 324.0], [11.9, 325.0], [12.0, 326.0], [12.1, 327.0], [12.2, 328.0], [12.3, 329.0], [12.4, 329.0], [12.5, 330.0], [12.6, 332.0], [12.7, 333.0], [12.8, 334.0], [12.9, 335.0], [13.0, 336.0], [13.1, 336.0], [13.2, 338.0], [13.3, 339.0], [13.4, 340.0], [13.5, 342.0], [13.6, 343.0], [13.7, 344.0], [13.8, 345.0], [13.9, 346.0], [14.0, 348.0], [14.1, 349.0], [14.2, 350.0], [14.3, 351.0], [14.4, 353.0], [14.5, 354.0], [14.6, 355.0], [14.7, 356.0], [14.8, 358.0], [14.9, 358.0], [15.0, 360.0], [15.1, 360.0], [15.2, 361.0], [15.3, 362.0], [15.4, 363.0], [15.5, 365.0], [15.6, 366.0], [15.7, 368.0], [15.8, 368.0], [15.9, 370.0], [16.0, 372.0], [16.1, 373.0], [16.2, 374.0], [16.3, 375.0], [16.4, 376.0], [16.5, 377.0], [16.6, 378.0], [16.7, 380.0], [16.8, 381.0], [16.9, 383.0], [17.0, 384.0], [17.1, 386.0], [17.2, 387.0], [17.3, 388.0], [17.4, 389.0], [17.5, 390.0], [17.6, 391.0], [17.7, 393.0], [17.8, 394.0], [17.9, 396.0], [18.0, 397.0], [18.1, 398.0], [18.2, 400.0], [18.3, 401.0], [18.4, 402.0], [18.5, 404.0], [18.6, 407.0], [18.7, 409.0], [18.8, 411.0], [18.9, 412.0], [19.0, 414.0], [19.1, 416.0], [19.2, 418.0], [19.3, 420.0], [19.4, 422.0], [19.5, 424.0], [19.6, 426.0], [19.7, 427.0], [19.8, 430.0], [19.9, 433.0], [20.0, 437.0], [20.1, 439.0], [20.2, 442.0], [20.3, 444.0], [20.4, 445.0], [20.5, 447.0], [20.6, 450.0], [20.7, 452.0], [20.8, 455.0], [20.9, 460.0], [21.0, 463.0], [21.1, 467.0], [21.2, 470.0], [21.3, 472.0], [21.4, 477.0], [21.5, 482.0], [21.6, 487.0], [21.7, 490.0], [21.8, 494.0], [21.9, 499.0], [22.0, 505.0], [22.1, 511.0], [22.2, 517.0], [22.3, 521.0], [22.4, 527.0], [22.5, 535.0], [22.6, 544.0], [22.7, 560.0], [22.8, 574.0], [22.9, 586.0], [23.0, 607.0], [23.1, 624.0], [23.2, 649.0], [23.3, 697.0], [23.4, 733.0], [23.5, 754.0], [23.6, 791.0], [23.7, 809.0], [23.8, 816.0], [23.9, 833.0], [24.0, 849.0], [24.1, 859.0], [24.2, 867.0], [24.3, 874.0], [24.4, 885.0], [24.5, 892.0], [24.6, 899.0], [24.7, 903.0], [24.8, 908.0], [24.9, 911.0], [25.0, 915.0], [25.1, 920.0], [25.2, 921.0], [25.3, 924.0], [25.4, 927.0], [25.5, 930.0], [25.6, 933.0], [25.7, 935.0], [25.8, 939.0], [25.9, 941.0], [26.0, 943.0], [26.1, 945.0], [26.2, 947.0], [26.3, 948.0], [26.4, 951.0], [26.5, 955.0], [26.6, 957.0], [26.7, 959.0], [26.8, 962.0], [26.9, 965.0], [27.0, 967.0], [27.1, 969.0], [27.2, 969.0], [27.3, 972.0], [27.4, 973.0], [27.5, 976.0], [27.6, 977.0], [27.7, 979.0], [27.8, 981.0], [27.9, 983.0], [28.0, 984.0], [28.1, 988.0], [28.2, 989.0], [28.3, 991.0], [28.4, 992.0], [28.5, 994.0], [28.6, 995.0], [28.7, 996.0], [28.8, 998.0], [28.9, 1000.0], [29.0, 1002.0], [29.1, 1003.0], [29.2, 1004.0], [29.3, 1005.0], [29.4, 1006.0], [29.5, 1008.0], [29.6, 1010.0], [29.7, 1011.0], [29.8, 1011.0], [29.9, 1013.0], [30.0, 1014.0], [30.1, 1015.0], [30.2, 1016.0], [30.3, 1017.0], [30.4, 1017.0], [30.5, 1018.0], [30.6, 1019.0], [30.7, 1020.0], [30.8, 1021.0], [30.9, 1022.0], [31.0, 1023.0], [31.1, 1024.0], [31.2, 1025.0], [31.3, 1026.0], [31.4, 1027.0], [31.5, 1028.0], [31.6, 1029.0], [31.7, 1030.0], [31.8, 1031.0], [31.9, 1032.0], [32.0, 1034.0], [32.1, 1035.0], [32.2, 1035.0], [32.3, 1036.0], [32.4, 1037.0], [32.5, 1038.0], [32.6, 1039.0], [32.7, 1041.0], [32.8, 1041.0], [32.9, 1042.0], [33.0, 1043.0], [33.1, 1044.0], [33.2, 1045.0], [33.3, 1046.0], [33.4, 1048.0], [33.5, 1048.0], [33.6, 1050.0], [33.7, 1050.0], [33.8, 1051.0], [33.9, 1052.0], [34.0, 1054.0], [34.1, 1055.0], [34.2, 1056.0], [34.3, 1057.0], [34.4, 1058.0], [34.5, 1059.0], [34.6, 1059.0], [34.7, 1060.0], [34.8, 1061.0], [34.9, 1062.0], [35.0, 1063.0], [35.1, 1064.0], [35.2, 1065.0], [35.3, 1066.0], [35.4, 1067.0], [35.5, 1069.0], [35.6, 1069.0], [35.7, 1070.0], [35.8, 1072.0], [35.9, 1073.0], [36.0, 1074.0], [36.1, 1074.0], [36.2, 1076.0], [36.3, 1076.0], [36.4, 1077.0], [36.5, 1078.0], [36.6, 1078.0], [36.7, 1080.0], [36.8, 1080.0], [36.9, 1081.0], [37.0, 1082.0], [37.1, 1083.0], [37.2, 1084.0], [37.3, 1085.0], [37.4, 1085.0], [37.5, 1086.0], [37.6, 1087.0], [37.7, 1089.0], [37.8, 1089.0], [37.9, 1090.0], [38.0, 1090.0], [38.1, 1091.0], [38.2, 1092.0], [38.3, 1092.0], [38.4, 1094.0], [38.5, 1095.0], [38.6, 1095.0], [38.7, 1096.0], [38.8, 1097.0], [38.9, 1097.0], [39.0, 1098.0], [39.1, 1099.0], [39.2, 1100.0], [39.3, 1101.0], [39.4, 1102.0], [39.5, 1103.0], [39.6, 1104.0], [39.7, 1104.0], [39.8, 1105.0], [39.9, 1106.0], [40.0, 1107.0], [40.1, 1107.0], [40.2, 1108.0], [40.3, 1109.0], [40.4, 1109.0], [40.5, 1110.0], [40.6, 1111.0], [40.7, 1112.0], [40.8, 1113.0], [40.9, 1113.0], [41.0, 1114.0], [41.1, 1115.0], [41.2, 1115.0], [41.3, 1116.0], [41.4, 1117.0], [41.5, 1118.0], [41.6, 1118.0], [41.7, 1119.0], [41.8, 1120.0], [41.9, 1120.0], [42.0, 1121.0], [42.1, 1122.0], [42.2, 1122.0], [42.3, 1123.0], [42.4, 1124.0], [42.5, 1125.0], [42.6, 1126.0], [42.7, 1127.0], [42.8, 1127.0], [42.9, 1128.0], [43.0, 1129.0], [43.1, 1130.0], [43.2, 1131.0], [43.3, 1131.0], [43.4, 1132.0], [43.5, 1133.0], [43.6, 1133.0], [43.7, 1134.0], [43.8, 1135.0], [43.9, 1136.0], [44.0, 1137.0], [44.1, 1138.0], [44.2, 1139.0], [44.3, 1140.0], [44.4, 1141.0], [44.5, 1142.0], [44.6, 1143.0], [44.7, 1144.0], [44.8, 1145.0], [44.9, 1146.0], [45.0, 1147.0], [45.1, 1148.0], [45.2, 1149.0], [45.3, 1149.0], [45.4, 1150.0], [45.5, 1151.0], [45.6, 1152.0], [45.7, 1152.0], [45.8, 1153.0], [45.9, 1154.0], [46.0, 1155.0], [46.1, 1156.0], [46.2, 1157.0], [46.3, 1158.0], [46.4, 1159.0], [46.5, 1160.0], [46.6, 1160.0], [46.7, 1161.0], [46.8, 1162.0], [46.9, 1163.0], [47.0, 1164.0], [47.1, 1165.0], [47.2, 1166.0], [47.3, 1167.0], [47.4, 1168.0], [47.5, 1169.0], [47.6, 1169.0], [47.7, 1170.0], [47.8, 1171.0], [47.9, 1172.0], [48.0, 1173.0], [48.1, 1174.0], [48.2, 1175.0], [48.3, 1176.0], [48.4, 1177.0], [48.5, 1178.0], [48.6, 1179.0], [48.7, 1180.0], [48.8, 1181.0], [48.9, 1182.0], [49.0, 1182.0], [49.1, 1183.0], [49.2, 1184.0], [49.3, 1185.0], [49.4, 1185.0], [49.5, 1187.0], [49.6, 1188.0], [49.7, 1189.0], [49.8, 1190.0], [49.9, 1191.0], [50.0, 1192.0], [50.1, 1192.0], [50.2, 1194.0], [50.3, 1194.0], [50.4, 1195.0], [50.5, 1196.0], [50.6, 1197.0], [50.7, 1198.0], [50.8, 1199.0], [50.9, 1200.0], [51.0, 1201.0], [51.1, 1202.0], [51.2, 1202.0], [51.3, 1203.0], [51.4, 1204.0], [51.5, 1205.0], [51.6, 1206.0], [51.7, 1207.0], [51.8, 1208.0], [51.9, 1209.0], [52.0, 1210.0], [52.1, 1211.0], [52.2, 1212.0], [52.3, 1213.0], [52.4, 1214.0], [52.5, 1215.0], [52.6, 1215.0], [52.7, 1216.0], [52.8, 1217.0], [52.9, 1218.0], [53.0, 1219.0], [53.1, 1219.0], [53.2, 1220.0], [53.3, 1222.0], [53.4, 1223.0], [53.5, 1224.0], [53.6, 1224.0], [53.7, 1225.0], [53.8, 1226.0], [53.9, 1227.0], [54.0, 1228.0], [54.1, 1229.0], [54.2, 1230.0], [54.3, 1232.0], [54.4, 1232.0], [54.5, 1233.0], [54.6, 1234.0], [54.7, 1235.0], [54.8, 1237.0], [54.9, 1238.0], [55.0, 1239.0], [55.1, 1240.0], [55.2, 1241.0], [55.3, 1243.0], [55.4, 1244.0], [55.5, 1245.0], [55.6, 1246.0], [55.7, 1247.0], [55.8, 1248.0], [55.9, 1249.0], [56.0, 1251.0], [56.1, 1251.0], [56.2, 1252.0], [56.3, 1253.0], [56.4, 1255.0], [56.5, 1255.0], [56.6, 1257.0], [56.7, 1258.0], [56.8, 1259.0], [56.9, 1260.0], [57.0, 1261.0], [57.1, 1262.0], [57.2, 1263.0], [57.3, 1264.0], [57.4, 1266.0], [57.5, 1267.0], [57.6, 1268.0], [57.7, 1269.0], [57.8, 1270.0], [57.9, 1271.0], [58.0, 1272.0], [58.1, 1273.0], [58.2, 1274.0], [58.3, 1275.0], [58.4, 1277.0], [58.5, 1278.0], [58.6, 1279.0], [58.7, 1280.0], [58.8, 1281.0], [58.9, 1283.0], [59.0, 1284.0], [59.1, 1285.0], [59.2, 1286.0], [59.3, 1288.0], [59.4, 1289.0], [59.5, 1290.0], [59.6, 1291.0], [59.7, 1292.0], [59.8, 1293.0], [59.9, 1295.0], [60.0, 1296.0], [60.1, 1297.0], [60.2, 1299.0], [60.3, 1300.0], [60.4, 1301.0], [60.5, 1303.0], [60.6, 1304.0], [60.7, 1305.0], [60.8, 1307.0], [60.9, 1307.0], [61.0, 1308.0], [61.1, 1310.0], [61.2, 1311.0], [61.3, 1312.0], [61.4, 1313.0], [61.5, 1314.0], [61.6, 1316.0], [61.7, 1317.0], [61.8, 1318.0], [61.9, 1321.0], [62.0, 1322.0], [62.1, 1323.0], [62.2, 1324.0], [62.3, 1327.0], [62.4, 1328.0], [62.5, 1330.0], [62.6, 1331.0], [62.7, 1332.0], [62.8, 1334.0], [62.9, 1335.0], [63.0, 1337.0], [63.1, 1338.0], [63.2, 1340.0], [63.3, 1342.0], [63.4, 1343.0], [63.5, 1345.0], [63.6, 1347.0], [63.7, 1348.0], [63.8, 1350.0], [63.9, 1351.0], [64.0, 1353.0], [64.1, 1354.0], [64.2, 1355.0], [64.3, 1357.0], [64.4, 1359.0], [64.5, 1360.0], [64.6, 1362.0], [64.7, 1364.0], [64.8, 1366.0], [64.9, 1367.0], [65.0, 1369.0], [65.1, 1370.0], [65.2, 1372.0], [65.3, 1374.0], [65.4, 1375.0], [65.5, 1377.0], [65.6, 1379.0], [65.7, 1381.0], [65.8, 1382.0], [65.9, 1384.0], [66.0, 1386.0], [66.1, 1387.0], [66.2, 1388.0], [66.3, 1390.0], [66.4, 1392.0], [66.5, 1394.0], [66.6, 1396.0], [66.7, 1397.0], [66.8, 1399.0], [66.9, 1402.0], [67.0, 1404.0], [67.1, 1406.0], [67.2, 1409.0], [67.3, 1411.0], [67.4, 1413.0], [67.5, 1415.0], [67.6, 1418.0], [67.7, 1419.0], [67.8, 1421.0], [67.9, 1423.0], [68.0, 1424.0], [68.1, 1427.0], [68.2, 1429.0], [68.3, 1433.0], [68.4, 1436.0], [68.5, 1438.0], [68.6, 1441.0], [68.7, 1443.0], [68.8, 1446.0], [68.9, 1448.0], [69.0, 1450.0], [69.1, 1454.0], [69.2, 1457.0], [69.3, 1459.0], [69.4, 1462.0], [69.5, 1465.0], [69.6, 1468.0], [69.7, 1471.0], [69.8, 1475.0], [69.9, 1478.0], [70.0, 1482.0], [70.1, 1484.0], [70.2, 1487.0], [70.3, 1492.0], [70.4, 1496.0], [70.5, 1500.0], [70.6, 1504.0], [70.7, 1508.0], [70.8, 1516.0], [70.9, 1526.0], [71.0, 1531.0], [71.1, 1542.0], [71.2, 1551.0], [71.3, 1558.0], [71.4, 1572.0], [71.5, 1589.0], [71.6, 1633.0], [71.7, 1710.0], [71.8, 1784.0], [71.9, 1928.0], [72.0, 2072.0], [72.1, 2265.0], [72.2, 2387.0], [72.3, 2490.0], [72.4, 2578.0], [72.5, 2644.0], [72.6, 2686.0], [72.7, 2717.0], [72.8, 2803.0], [72.9, 2835.0], [73.0, 2882.0], [73.1, 2924.0], [73.2, 2963.0], [73.3, 3013.0], [73.4, 3046.0], [73.5, 3073.0], [73.6, 3097.0], [73.7, 3129.0], [73.8, 3155.0], [73.9, 3176.0], [74.0, 3201.0], [74.1, 3219.0], [74.2, 3245.0], [74.3, 3267.0], [74.4, 3287.0], [74.5, 3315.0], [74.6, 3337.0], [74.7, 3346.0], [74.8, 3364.0], [74.9, 3372.0], [75.0, 3385.0], [75.1, 3415.0], [75.2, 3433.0], [75.3, 3448.0], [75.4, 3469.0], [75.5, 3479.0], [75.6, 3497.0], [75.7, 3514.0], [75.8, 3531.0], [75.9, 3546.0], [76.0, 3562.0], [76.1, 3577.0], [76.2, 3594.0], [76.3, 3608.0], [76.4, 3619.0], [76.5, 3632.0], [76.6, 3642.0], [76.7, 3649.0], [76.8, 3661.0], [76.9, 3672.0], [77.0, 3686.0], [77.1, 3701.0], [77.2, 3710.0], [77.3, 3726.0], [77.4, 3739.0], [77.5, 3748.0], [77.6, 3756.0], [77.7, 3765.0], [77.8, 3771.0], [77.9, 3778.0], [78.0, 3793.0], [78.1, 3805.0], [78.2, 3825.0], [78.3, 3838.0], [78.4, 3846.0], [78.5, 3860.0], [78.6, 3872.0], [78.7, 3893.0], [78.8, 3898.0], [78.9, 3919.0], [79.0, 3933.0], [79.1, 3942.0], [79.2, 3960.0], [79.3, 3971.0], [79.4, 3980.0], [79.5, 3988.0], [79.6, 3998.0], [79.7, 4009.0], [79.8, 4026.0], [79.9, 4038.0], [80.0, 4046.0], [80.1, 4056.0], [80.2, 4067.0], [80.3, 4082.0], [80.4, 4088.0], [80.5, 4097.0], [80.6, 4112.0], [80.7, 4123.0], [80.8, 4134.0], [80.9, 4147.0], [81.0, 4169.0], [81.1, 4186.0], [81.2, 4197.0], [81.3, 4215.0], [81.4, 4226.0], [81.5, 4240.0], [81.6, 4267.0], [81.7, 4284.0], [81.8, 4309.0], [81.9, 4337.0], [82.0, 4351.0], [82.1, 4380.0], [82.2, 4404.0], [82.3, 4425.0], [82.4, 4448.0], [82.5, 4472.0], [82.6, 4504.0], [82.7, 4532.0], [82.8, 4561.0], [82.9, 4606.0], [83.0, 4660.0], [83.1, 4712.0], [83.2, 4775.0], [83.3, 4848.0], [83.4, 4962.0], [83.5, 5068.0], [83.6, 5108.0], [83.7, 5179.0], [83.8, 5242.0], [83.9, 5319.0], [84.0, 5409.0], [84.1, 5453.0], [84.2, 5543.0], [84.3, 5654.0], [84.4, 5749.0], [84.5, 5819.0], [84.6, 5912.0], [84.7, 5982.0], [84.8, 6031.0], [84.9, 6089.0], [85.0, 6160.0], [85.1, 6209.0], [85.2, 6260.0], [85.3, 6331.0], [85.4, 6377.0], [85.5, 6402.0], [85.6, 6447.0], [85.7, 6471.0], [85.8, 6491.0], [85.9, 6528.0], [86.0, 6563.0], [86.1, 6584.0], [86.2, 6606.0], [86.3, 6630.0], [86.4, 6663.0], [86.5, 6688.0], [86.6, 6710.0], [86.7, 6724.0], [86.8, 6746.0], [86.9, 6771.0], [87.0, 6787.0], [87.1, 6812.0], [87.2, 6827.0], [87.3, 6847.0], [87.4, 6860.0], [87.5, 6884.0], [87.6, 6895.0], [87.7, 6906.0], [87.8, 6921.0], [87.9, 6950.0], [88.0, 6974.0], [88.1, 6987.0], [88.2, 7008.0], [88.3, 7028.0], [88.4, 7046.0], [88.5, 7066.0], [88.6, 7077.0], [88.7, 7096.0], [88.8, 7109.0], [88.9, 7127.0], [89.0, 7143.0], [89.1, 7161.0], [89.2, 7174.0], [89.3, 7196.0], [89.4, 7208.0], [89.5, 7221.0], [89.6, 7232.0], [89.7, 7249.0], [89.8, 7258.0], [89.9, 7280.0], [90.0, 7298.0], [90.1, 7316.0], [90.2, 7326.0], [90.3, 7338.0], [90.4, 7362.0], [90.5, 7378.0], [90.6, 7402.0], [90.7, 7412.0], [90.8, 7434.0], [90.9, 7455.0], [91.0, 7471.0], [91.1, 7484.0], [91.2, 7504.0], [91.3, 7519.0], [91.4, 7530.0], [91.5, 7536.0], [91.6, 7546.0], [91.7, 7563.0], [91.8, 7572.0], [91.9, 7585.0], [92.0, 7597.0], [92.1, 7609.0], [92.2, 7628.0], [92.3, 7645.0], [92.4, 7653.0], [92.5, 7664.0], [92.6, 7679.0], [92.7, 7696.0], [92.8, 7707.0], [92.9, 7722.0], [93.0, 7736.0], [93.1, 7758.0], [93.2, 7766.0], [93.3, 7780.0], [93.4, 7797.0], [93.5, 7811.0], [93.6, 7830.0], [93.7, 7847.0], [93.8, 7860.0], [93.9, 7875.0], [94.0, 7888.0], [94.1, 7906.0], [94.2, 7924.0], [94.3, 7952.0], [94.4, 7963.0], [94.5, 7971.0], [94.6, 7994.0], [94.7, 8006.0], [94.8, 8032.0], [94.9, 8045.0], [95.0, 8078.0], [95.1, 8092.0], [95.2, 8115.0], [95.3, 8131.0], [95.4, 8145.0], [95.5, 8162.0], [95.6, 8180.0], [95.7, 8197.0], [95.8, 8225.0], [95.9, 8247.0], [96.0, 8264.0], [96.1, 8287.0], [96.2, 8314.0], [96.3, 8330.0], [96.4, 8359.0], [96.5, 8382.0], [96.6, 8412.0], [96.7, 8431.0], [96.8, 8450.0], [96.9, 8468.0], [97.0, 8500.0], [97.1, 8520.0], [97.2, 8545.0], [97.3, 8579.0], [97.4, 8610.0], [97.5, 8647.0], [97.6, 8685.0], [97.7, 8720.0], [97.8, 8763.0], [97.9, 8801.0], [98.0, 8836.0], [98.1, 8873.0], [98.2, 8946.0], [98.3, 8996.0], [98.4, 9027.0], [98.5, 9081.0], [98.6, 9114.0], [98.7, 9194.0], [98.8, 9230.0], [98.9, 9313.0], [99.0, 9402.0], [99.1, 9498.0], [99.2, 9592.0], [99.3, 9675.0], [99.4, 9763.0], [99.5, 10007.0], [99.6, 10330.0], [99.7, 10958.0], [99.8, 12348.0], [99.9, 13969.0], [100.0, 60193.0]], "isOverall": false, "label": "Digisoria Shopfront 132", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 1492.0, "series": [{"data": [[0.0, 164.0], [100.0, 196.0], [200.0, 865.0], [60100.0, 7.0], [300.0, 1081.0], [400.0, 471.0], [500.0, 136.0], [600.0, 41.0], [700.0, 45.0], [800.0, 121.0], [900.0, 538.0], [1000.0, 1300.0], [1100.0, 1492.0], [1200.0, 1189.0], [1300.0, 831.0], [1400.0, 465.0], [1500.0, 134.0], [1600.0, 18.0], [1700.0, 17.0], [1800.0, 6.0], [1900.0, 11.0], [2000.0, 6.0], [2100.0, 7.0], [2300.0, 13.0], [2200.0, 9.0], [2400.0, 10.0], [2500.0, 14.0], [2600.0, 29.0], [2800.0, 30.0], [2700.0, 18.0], [2900.0, 29.0], [3000.0, 45.0], [3100.0, 48.0], [3200.0, 57.0], [3300.0, 75.0], [3400.0, 73.0], [3500.0, 78.0], [3600.0, 110.0], [3700.0, 121.0], [3800.0, 96.0], [3900.0, 104.0], [4000.0, 114.0], [4100.0, 88.0], [4300.0, 53.0], [4200.0, 71.0], [4500.0, 39.0], [4400.0, 49.0], [4600.0, 22.0], [4800.0, 17.0], [4700.0, 20.0], [5100.0, 19.0], [4900.0, 10.0], [5000.0, 20.0], [5300.0, 10.0], [5200.0, 19.0], [5400.0, 26.0], [5500.0, 11.0], [5600.0, 11.0], [5700.0, 16.0], [5800.0, 15.0], [5900.0, 21.0], [6000.0, 19.0], [6100.0, 22.0], [6300.0, 25.0], [6200.0, 24.0], [6500.0, 44.0], [6600.0, 50.0], [6400.0, 44.0], [6900.0, 65.0], [6800.0, 77.0], [6700.0, 62.0], [7100.0, 76.0], [7000.0, 72.0], [7400.0, 76.0], [7200.0, 85.0], [7300.0, 72.0], [7500.0, 107.0], [7600.0, 91.0], [7900.0, 76.0], [7700.0, 87.0], [7800.0, 79.0], [8100.0, 74.0], [8000.0, 62.0], [8700.0, 32.0], [8500.0, 46.0], [8600.0, 36.0], [8400.0, 56.0], [8300.0, 52.0], [8200.0, 54.0], [9000.0, 32.0], [8800.0, 34.0], [9200.0, 23.0], [8900.0, 20.0], [9100.0, 18.0], [9400.0, 13.0], [9700.0, 12.0], [9600.0, 16.0], [9300.0, 13.0], [9500.0, 13.0], [10000.0, 4.0], [9800.0, 5.0], [10100.0, 4.0], [9900.0, 4.0], [10200.0, 4.0], [10400.0, 6.0], [10300.0, 4.0], [10500.0, 2.0], [11100.0, 1.0], [10800.0, 1.0], [10900.0, 1.0], [11000.0, 1.0], [11700.0, 1.0], [11500.0, 2.0], [11400.0, 1.0], [12200.0, 1.0], [11800.0, 2.0], [12000.0, 1.0], [11900.0, 2.0], [12300.0, 2.0], [12500.0, 1.0], [12400.0, 2.0], [12900.0, 2.0], [12800.0, 1.0], [13200.0, 1.0], [13500.0, 2.0], [13600.0, 1.0], [13700.0, 1.0], [14100.0, 1.0], [14200.0, 1.0], [13900.0, 1.0], [15400.0, 1.0], [60000.0, 2.0]], "isOverall": false, "label": "Digisoria Shopfront 132", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 60100.0, "title": "Response Time Distribution"}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"minY": 1.0, "minX": 1.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 10748.0, "series": [{"data": [[1.0, 1.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[3.0, 10748.0]], "isOverall": false, "label": "Requests in error", "isController": false}, {"data": [[2.0, 1927.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 3.0, "title": "Synthetic Response Times Distribution"}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                },
                colors: ["#9ACD32", "yellow", "orange", "#FF6347"]                
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"minY": 43.16759776536312, "minX": 1.52509998E12, "maxY": 50.0, "series": [{"data": [[1.52510022E12, 50.0], [1.52510004E12, 50.0], [1.52510052E12, 50.0], [1.52510034E12, 50.0], [1.52510016E12, 50.0], [1.52509998E12, 48.8992974238876], [1.52510046E12, 50.0], [1.52510028E12, 50.0], [1.5251001E12, 50.0], [1.52510058E12, 43.16759776536312], [1.5251004E12, 50.0]], "isOverall": false, "label": "Digisoria Customer 1", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52510058E12, "title": "Active Threads Over Time"}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"minY": 40.0, "minX": 2.0, "maxY": 6339.0, "series": [{"data": [[33.0, 2360.0], [32.0, 1308.0], [2.0, 1844.0], [35.0, 1969.3333333333333], [36.0, 3277.75], [37.0, 4261.5], [38.0, 3185.0], [39.0, 1025.0], [41.0, 4775.0], [40.0, 1250.0], [42.0, 5283.666666666666], [43.0, 2615.0], [45.0, 3306.5], [44.0, 550.0], [46.0, 2515.5], [49.0, 6339.0], [48.0, 41.0], [50.0, 2373.640244386243], [4.0, 5442.0], [6.0, 1727.0], [7.0, 1161.0], [8.0, 1335.0], [9.0, 510.0], [10.0, 1073.0], [11.0, 74.0], [13.0, 657.0], [14.0, 2229.5], [15.0, 2660.0], [16.0, 1396.0], [17.0, 2752.3333333333335], [19.0, 1179.0], [20.0, 4287.0], [23.0, 1518.25], [24.0, 2582.0], [25.0, 2203.5], [26.0, 1790.5], [27.0, 5200.0], [28.0, 643.0], [29.0, 5212.0], [30.0, 40.0], [31.0, 4314.5]], "isOverall": false, "label": "Digisoria Shopfront 132", "isController": false}, {"data": [[49.8664405175133, 2374.1298516882343]], "isOverall": false, "label": "Digisoria Shopfront 132-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 50.0, "title": "Time VS Threads"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"minY": 2486.633333333333, "minX": 1.52509998E12, "maxY": 220460.5, "series": [{"data": [[1.52510022E12, 191479.43333333332], [1.52510004E12, 70441.4], [1.52510052E12, 116715.18333333333], [1.52510034E12, 133247.48333333334], [1.52510016E12, 220460.5], [1.52509998E12, 71360.55], [1.52510046E12, 126648.36666666667], [1.52510028E12, 130136.63333333333], [1.5251001E12, 164876.83333333334], [1.52510058E12, 16509.033333333333], [1.5251004E12, 128621.81666666667]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.52510022E12, 31721.933333333334], [1.52510004E12, 10422.666666666666], [1.52510052E12, 19631.233333333334], [1.52510034E12, 21520.033333333333], [1.52510016E12, 36607.1], [1.52509998E12, 9031.366666666667], [1.52510046E12, 21296.866666666665], [1.52510028E12, 20691.6], [1.5251001E12, 28087.566666666666], [1.52510058E12, 2486.633333333333], [1.5251004E12, 20567.033333333333]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52510058E12, "title": "Bytes Throughput Over Time"}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"minY": 1182.6493096646916, "minX": 1.52509998E12, "maxY": 6484.580796252929, "series": [{"data": [[1.52510022E12, 1368.0639008106805], [1.52510004E12, 6348.753424657533], [1.52510052E12, 3100.102434077079], [1.52510034E12, 2865.4345749761214], [1.52510016E12, 1182.6493096646916], [1.52509998E12, 6484.580796252929], [1.52510046E12, 2744.0309568480293], [1.52510028E12, 3008.35621890547], [1.5251001E12, 1735.8883034773442], [1.52510058E12, 2214.9441340782137], [1.5251004E12, 2987.391783567131]], "isOverall": false, "label": "Digisoria Shopfront 132", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52510058E12, "title": "Response Time Over Time"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"minY": 71.52513966480447, "minX": 1.52509998E12, "maxY": 151.81498829039822, "series": [{"data": [[1.52510022E12, 97.440152598951], [1.52510004E12, 120.01141552511423], [1.52510052E12, 80.9929006085193], [1.52510034E12, 79.17096466093595], [1.52510016E12, 77.11676528599598], [1.52509998E12, 151.81498829039822], [1.52510046E12, 79.7091932457786], [1.52510028E12, 76.50945273631832], [1.5251001E12, 85.12065331928345], [1.52510058E12, 71.52513966480447], [1.5251004E12, 76.30761523046088]], "isOverall": false, "label": "Digisoria Shopfront 132", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52510058E12, "title": "Latencies Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"minY": 35.854748603351936, "minX": 1.52509998E12, "maxY": 89.74941451990637, "series": [{"data": [[1.52510022E12, 39.661421077730175], [1.52510004E12, 69.68949771689499], [1.52510052E12, 38.31135902636924], [1.52510034E12, 40.971346704871124], [1.52510016E12, 37.51794871794867], [1.52509998E12, 89.74941451990637], [1.52510046E12, 39.45590994371485], [1.52510028E12, 38.69353233830849], [1.5251001E12, 41.93888303477347], [1.52510058E12, 35.854748603351936], [1.5251004E12, 38.24048096192385]], "isOverall": false, "label": "Digisoria Shopfront 132", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52510058E12, "title": "Connect Time Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"minY": 1495.0, "minX": 1.52509998E12, "maxY": 15402.0, "series": [{"data": [[1.52510022E12, 11935.0], [1.52510004E12, 9897.0], [1.52510052E12, 11016.0], [1.52510034E12, 8998.0], [1.52509998E12, 11131.0], [1.52510046E12, 9154.0], [1.52510028E12, 9924.0], [1.5251001E12, 15402.0], [1.52510058E12, 9744.0], [1.5251004E12, 8836.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.52510022E12, 1495.0], [1.52510004E12, 5699.0], [1.52510052E12, 5447.0], [1.52510034E12, 5428.0], [1.52509998E12, 2072.0], [1.52510046E12, 3520.0], [1.52510028E12, 5211.0], [1.5251001E12, 6046.0], [1.52510058E12, 6353.0], [1.5251004E12, 5067.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.52510022E12, 9624.4], [1.52510004E12, 9461.0], [1.52510052E12, 9004.6], [1.52510034E12, 9254.5], [1.52509998E12, 9681.7], [1.52510046E12, 9008.2], [1.52510028E12, 9431.300000000001], [1.5251001E12, 9626.4], [1.52510058E12, 9006.2], [1.5251004E12, 9104.6]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.52510022E12, 13605.090000000004], [1.52510004E12, 10432.92], [1.52510052E12, 11932.900000000001], [1.52510034E12, 12785.29999999997], [1.52509998E12, 10493.58], [1.52510046E12, 12191.140000000012], [1.52510028E12, 13078.60999999999], [1.5251001E12, 13652.070000000002], [1.52510058E12, 11926.300000000001], [1.5251004E12, 12428.39]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.52510022E12, 10309.2], [1.52510004E12, 9726.599999999999], [1.52510052E12, 9503.0], [1.52510034E12, 9718.5], [1.52509998E12, 9963.55], [1.52510046E12, 9514.0], [1.52510028E12, 9897.05], [1.5251001E12, 10299.599999999999], [1.52510058E12, 9503.0], [1.5251004E12, 9615.05]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52510058E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"minY": 381.0, "minX": 2.0, "maxY": 9472.0, "series": [{"data": [[16.0, 7494.5], [2.0, 7875.0], [34.0, 7585.0], [17.0, 7258.0], [7.0, 8235.0], [31.0, 9472.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[16.0, 399.0], [2.0, 492.0], [34.0, 1158.0], [17.0, 381.0], [42.0, 1174.0], [7.0, 2419.0], [31.0, 1169.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 42.0, "title": "Response Time Vs Request"}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.create();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"minY": 39.0, "minX": 2.0, "maxY": 115.0, "series": [{"data": [[16.0, 109.0], [2.0, 108.5], [34.0, 112.5], [17.0, 109.0], [7.0, 115.0], [31.0, 113.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[16.0, 108.0], [2.0, 39.0], [34.0, 48.0], [17.0, 47.0], [42.0, 44.0], [7.0, 114.0], [31.0, 108.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 42.0, "title": "Latencies Vs Request"}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"minY": 0.2, "minX": 1.52509992E12, "maxY": 42.25, "series": [{"data": [[1.52510022E12, 34.95], [1.52510004E12, 7.3], [1.52510052E12, 16.433333333333334], [1.52510034E12, 17.45], [1.52510016E12, 42.25], [1.52509998E12, 7.75], [1.52510046E12, 17.766666666666666], [1.52510028E12, 16.75], [1.5251001E12, 31.633333333333333], [1.52510058E12, 2.15], [1.52509992E12, 0.2], [1.5251004E12, 16.633333333333333]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52510058E12, "title": "Hits Per Second"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"minY": 0.016666666666666666, "minX": 1.52509998E12, "maxY": 42.25, "series": [{"data": [[1.52510022E12, 0.9], [1.52510004E12, 4.716666666666667], [1.52510052E12, 3.3], [1.52510034E12, 4.266666666666667], [1.52509998E12, 5.033333333333333], [1.52510046E12, 3.933333333333333], [1.52510028E12, 4.433333333333334], [1.5251001E12, 0.8833333333333333], [1.52510058E12, 0.36666666666666664], [1.5251004E12, 4.3]], "isOverall": false, "label": "200", "isController": false}, {"data": [[1.52510022E12, 34.05], [1.52510004E12, 1.9333333333333333], [1.52510052E12, 12.716666666666667], [1.52510034E12, 13.183333333333334], [1.52510016E12, 42.25], [1.52509998E12, 1.15], [1.52510046E12, 13.266666666666667], [1.52510028E12, 12.316666666666666], [1.5251001E12, 29.35], [1.52510058E12, 1.5833333333333333], [1.5251004E12, 12.333333333333334]], "isOverall": false, "label": "500", "isController": false}, {"data": [[1.52510058E12, 0.016666666666666666]], "isOverall": false, "label": "Non HTTP response code: java.io.InterruptedIOException", "isController": false}, {"data": [[1.52510004E12, 0.65], [1.52510052E12, 0.3333333333333333], [1.52509998E12, 0.9333333333333333], [1.52510046E12, 0.5666666666666667], [1.5251001E12, 1.2333333333333334], [1.52510058E12, 0.2]], "isOverall": false, "label": "403", "isController": false}, {"data": [[1.52510052E12, 0.016666666666666666], [1.5251001E12, 0.05]], "isOverall": false, "label": "502", "isController": false}, {"data": [[1.5251001E12, 0.016666666666666666]], "isOverall": false, "label": "404", "isController": false}, {"data": [[1.52510052E12, 0.06666666666666667], [1.5251001E12, 0.08333333333333333]], "isOverall": false, "label": "504", "isController": false}, {"data": [[1.5251001E12, 0.016666666666666666]], "isOverall": false, "label": "Non HTTP response code: org.apache.http.ConnectionClosedException", "isController": false}, {"data": [[1.52510058E12, 0.8166666666666667]], "isOverall": false, "label": "Non HTTP response code: java.net.SocketException", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52510058E12, "title": "Codes Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"minY": 0.36666666666666664, "minX": 1.52509998E12, "maxY": 42.25, "series": [{"data": [[1.52510022E12, 0.9], [1.52510004E12, 4.716666666666667], [1.52510052E12, 3.3], [1.52510034E12, 4.266666666666667], [1.52509998E12, 5.033333333333333], [1.52510046E12, 3.933333333333333], [1.52510028E12, 4.433333333333334], [1.5251001E12, 0.8833333333333333], [1.52510058E12, 0.36666666666666664], [1.5251004E12, 4.3]], "isOverall": false, "label": "Digisoria Shopfront 132-success", "isController": false}, {"data": [[1.52510022E12, 34.05], [1.52510004E12, 2.5833333333333335], [1.52510052E12, 13.133333333333333], [1.52510034E12, 13.183333333333334], [1.52510016E12, 42.25], [1.52509998E12, 2.0833333333333335], [1.52510046E12, 13.833333333333334], [1.52510028E12, 12.316666666666666], [1.5251001E12, 30.75], [1.52510058E12, 2.6166666666666667], [1.5251004E12, 12.333333333333334]], "isOverall": false, "label": "Digisoria Shopfront 132-failure", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52510058E12, "title": "Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

// Collapse
$(function() {
        $('.collapse').on('shown.bs.collapse', function(){
            collapse(this, false);
        }).on('hidden.bs.collapse', function(){
            collapse(this, true);
        });
});

$(function() {
    $(".glyphicon").mousedown( function(event){
        var tmp = $('.in:not(ul)');
        tmp.parent().parent().parent().find(".fa-chevron-up").removeClass("fa-chevron-down").addClass("fa-chevron-down");
        tmp.removeClass("in");
        tmp.addClass("out");
    });
});

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "responseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    choiceContainer.find("label").each(function(){
        this.style.color = color;
    });
}

// Unchecks all boxes for "Hide all samples" functionality
function uncheckAll(id){
    toggleAll(id, false);
}

// Checks all boxes for "Show all samples" functionality
function checkAll(id){
    toggleAll(id, true);
}

// Prepares data to be consumed by plot plugins
function prepareData(series, choiceContainer, customizeSeries){
    var datasets = [];

    // Add only selected series to the data set
    choiceContainer.find("input:checked").each(function (index, item) {
        var key = $(item).attr("name");
        var i = 0;
        var size = series.length;
        while(i < size && series[i].label != key)
            i++;
        if(i < size){
            var currentSeries = series[i];
            datasets.push(currentSeries);
            if(customizeSeries)
                customizeSeries(currentSeries);
        }
    });
    return datasets;
}

/*
 * Ignore case comparator
 */
function sortAlphaCaseless(a,b){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
};

/*
 * Creates a legend in the specified element with graph information
 */
function createLegend(choiceContainer, infos) {
    // Sort series by name
    var keys = [];
    $.each(infos.data.result.series, function(index, series){
        keys.push(series.label);
    });
    keys.sort(sortAlphaCaseless);

    // Create list of series with support of activation/deactivation
    $.each(keys, function(index, key) {
        var id = choiceContainer.attr('id') + index;
        $('<li />')
            .append($('<input id="' + id + '" name="' + key + '" type="checkbox" checked="checked" hidden />'))
            .append($('<label />', { 'text': key , 'for': id }))
            .appendTo(choiceContainer);
    });
    choiceContainer.find("label").click( function(){
        if (this.style.color !== "rgb(129, 129, 129)" ){
            this.style.color="#818181";
        }else {
            this.style.color="black";
        }
        $(this).parent().children().children().toggleClass("legend-disabled");
    });
    choiceContainer.find("label").mousedown( function(event){
        event.preventDefault();
    });
    choiceContainer.find("label").mouseenter(function(){
        this.style.cursor="pointer";
    });

    // Recreate graphe on series activation toggle
    choiceContainer.find("input").click(function(){
        infos.createGraph();
    });
}
