/**
 * 01: Scan the predefined rectangle with the Top camera and save images.
 *
 * Area:
 *   X 361 to 411
 *   Y 208 to 319
 *
 * Output:
 *   /home/sean/Documents/OpenInvert-PnP/scans/<scan_id>/
 *     frames/*.png
 *     manifest.jsonl
 *
 * Cooperative pause/resume/halt:
 *   If /home/sean/Documents/OpenInvert-PnP/control/pause.flag exists, the
 *   scan pauses before the next move. Clearing the flag resumes the same run.
 *   If /home/sean/Documents/OpenInvert-PnP/control/stop.flag exists, the
 *   scan exits before the next move.
 *   The halt control GUI is launched automatically at scan start.
 */

load(scripting.getScriptsDirectory().toString() + '/Examples/JavaScript/Utility.js');

var imports = new JavaImporter(org.openpnp.model, java.io, javax.imageio);

with (imports) {
    function pad(number, width) {
        var text = String(number);
        while (text.length < width) {
            text = '0' + text;
        }
        return text;
    }

    function timestamp() {
        var now = new Date();
        return now.getFullYear()
            + pad(now.getMonth() + 1, 2)
            + pad(now.getDate(), 2)
            + '_'
            + pad(now.getHours(), 2)
            + pad(now.getMinutes(), 2)
            + pad(now.getSeconds(), 2);
    }

    function positions(start, stop, step, descending) {
        var values = [];
        var epsilon = 0.000001;

        if (descending) {
            for (var value = start; value >= stop + epsilon; value -= step) {
                values.push(value);
            }
            if (values.length === 0 || Math.abs(values[values.length - 1] - stop) > epsilon) {
                values.push(stop);
            }
        }
        else {
            for (var value = start; value <= stop - epsilon; value += step) {
                values.push(value);
            }
            if (values.length === 0 || Math.abs(values[values.length - 1] - stop) > epsilon) {
                values.push(stop);
            }
        }

        return values;
    }

    function jsonLine(frameIndex, fileName, x, y, requestedX, requestedY, width, height, unitsPerPixel) {
        var record = {
            frame_index: frameIndex,
            file_name: fileName,
            camera: 'Top',
            x_mm: x,
            y_mm: y,
            requested_x_mm: requestedX,
            requested_y_mm: requestedY,
            image_width_px: width,
            image_height_px: height,
            units_per_pixel_x_mm: unitsPerPixel.x,
            units_per_pixel_y_mm: unitsPerPixel.y
        };
        return JSON.stringify(record) + '\n';
    }

    function formatLocation(location) {
        return 'X=' + location.x.toFixed(3)
            + ' Y=' + location.y.toFixed(3)
            + ' Z=' + location.z.toFixed(3)
            + ' R=' + location.rotation.toFixed(3);
    }

    function getUnitsPerPixelForCurrentZ(camera) {
        try {
            return camera.getUnitsPerPixelAtZ();
        }
        catch (error) {
            return camera.getUnitsPerPixel();
        }
    }

    function writeText(file, text) {
        var writer = new FileWriter(file);
        try {
            writer.write(text);
        }
        finally {
            writer.close();
        }
    }

    function writeStatus(statusFile, status, scanId, frameIndex, totalFrames, message) {
        var record = {
            status: status,
            scan_id: scanId,
            frame_index: frameIndex,
            total_frames: totalFrames,
            message: message,
            updated_at: new Date().toISOString()
        };
        writeText(statusFile, JSON.stringify(record, null, 2) + '\n');
    }

    function haltRequested(stopFile, statusFile, scanId, frameIndex, totalFrames) {
        if (!stopFile.exists()) {
            return false;
        }

        print('Halt requested before frame ' + frameIndex + '. Stopping scan.');
        writeStatus(statusFile, 'halted', scanId, frameIndex, totalFrames, 'Halt requested before next move');
        return true;
    }

    function waitWhilePaused(pauseFile, stopFile, statusFile, scanId, frameIndex, totalFrames) {
        var announcedPause = false;

        while (pauseFile.exists()) {
            if (haltRequested(stopFile, statusFile, scanId, frameIndex, totalFrames)) {
                return false;
            }
            if (!announcedPause) {
                print('Pause requested before frame ' + frameIndex + '. Waiting for resume.');
                writeStatus(statusFile, 'paused', scanId, frameIndex, totalFrames, 'Paused before next move');
                announcedPause = true;
            }
            Packages.java.lang.Thread.sleep(500);
        }

        if (announcedPause) {
            print('Resume requested. Continuing at frame ' + frameIndex + '.');
            writeStatus(statusFile, 'running', scanId, frameIndex, totalFrames, 'Resumed scan');
        }

        return true;
    }

    function launchHaltGui(controlDir) {
        var projectDir = new File('/home/sean/Documents/OpenInvert-PnP');
        var python = '/home/sean/Documents/OpenInvert-PnP/.venv/bin/python';
        var guiScript = '/home/sean/Documents/OpenInvert-PnP/scripts/00_Halt_Control.py';
        var stdoutLog = new File(controlDir, 'halt_gui.out.log');
        var stderrLog = new File(controlDir, 'halt_gui.err.log');

        try {
            var builder = new Packages.java.lang.ProcessBuilder(python, guiScript);
            builder.directory(projectDir);
            builder.redirectOutput(stdoutLog);
            builder.redirectError(stderrLog);
            builder.start();
            print('Launched halt control GUI.');
        }
        catch (error) {
            print('Failed to launch halt control GUI: ' + error);
            print('See: ' + stderrLog.getAbsolutePath());
        }
    }

    function launchSegmentation(scanDir, controlDir) {
        var projectDir = new File('/home/sean/Documents/OpenInvert-PnP');
        var python = '/home/sean/Documents/OpenInvert-PnP/.venv/bin/python';
        var segmentScript = '/home/sean/Documents/OpenInvert-PnP/scripts/02_Segment_Scan_Objects.py';
        var stdoutLog = new File(controlDir, 'segmentation.out.log');
        var stderrLog = new File(controlDir, 'segmentation.err.log');

        try {
            var builder = new Packages.java.lang.ProcessBuilder(
                python,
                segmentScript,
                scanDir.getAbsolutePath(),
                '--watch'
            );
            builder.directory(projectDir);
            builder.redirectOutput(stdoutLog);
            builder.redirectError(stderrLog);
            builder.start();
            print('Launched segmentation for: ' + scanDir.getAbsolutePath());
        }
        catch (error) {
            print('Failed to launch segmentation: ' + error);
            print('See: ' + stderrLog.getAbsolutePath());
        }
    }

    function findHeadByName(headName) {
        try {
            var heads = machine.getHeads();
            for (var i = 0; i < heads.size(); i++) {
                var head = heads.get(i);
                if (head.getName() === headName) {
                    return head;
                }
            }
        }
        catch (error) {
            print('Could not enumerate heads; using default head: ' + error);
            if (machine.defaultHead.getName() === headName) {
                return machine.defaultHead;
            }
        }
        throw new Error('Requested pick head not found: ' + headName);
    }

    function findNozzleOnHead(head, nozzleName) {
        try {
            var nozzles = head.getNozzles();
            for (var i = 0; i < nozzles.size(); i++) {
                var nozzle = nozzles.get(i);
                if (nozzle.getName() === nozzleName) {
                    return nozzle;
                }
            }
        }
        catch (error) {
            print('Could not enumerate nozzles; using default nozzle: ' + error);
            if (head.defaultNozzle.getName() === nozzleName) {
                return head.defaultNozzle;
            }
        }
        throw new Error('Requested pick nozzle not found on head ' + head.getName() + ': ' + nozzleName);
    }

    function findPickTool(headName, nozzleName) {
        var head = findHeadByName(headName);
        var nozzle = findNozzleOnHead(head, nozzleName);
        print('Pick tool selected: head=' + head.getName()
            + ' nozzle=' + nozzle.getName()
            + ' nozzle location=' + formatLocation(nozzle.location));
        return {
            head: head,
            nozzle: nozzle
        };
    }

    function findVacuumActuator(head, nozzle) {
        var actuatorName = 'VAC1';

        try {
            actuatorName = nozzle.getVacuumActuatorName();
        }
        catch (error) {
            print('Could not read nozzle vacuum actuator name; using VAC1: ' + error);
        }

        try {
            return head.getActuatorByName(actuatorName);
        }
        catch (headError) {
            print('Could not get head actuator ' + actuatorName + ': ' + headError);
        }

        try {
            return machine.getActuatorByName(actuatorName);
        }
        catch (machineError) {
            print('Could not get machine actuator ' + actuatorName + ': ' + machineError);
        }

        throw new Error('Vacuum actuator not found: ' + actuatorName);
    }

    function setVacuum(vacuumActuator, enabled) {
        vacuumActuator.actuate(enabled);
        Packages.java.lang.Thread.sleep(200);
    }

    function nozzleLocationAt(nozzle, x, y, z) {
        return new Location(
            LengthUnit.Millimeters,
            x,
            y,
            z,
            nozzle.location.rotation
        );
    }

    function moveNozzleToXyAtZ(nozzle, x, y, z) {
        nozzle.moveTo(nozzleLocationAt(nozzle, x, y, z));
    }

    function debugPickTarget(scanDir, target, nozzle, travelZ, dryRun) {
        print('Pick coordinate debug for object ' + target.objectIndex + ':'
            + ' scan=' + scanDir.getName()
            + ' pick X=' + target.x.toFixed(3)
            + ' Y=' + target.y.toFixed(3)
            + ' frame X=' + target.frameX.toFixed(3)
            + ' Y=' + target.frameY.toFixed(3)
            + ' requested-frame estimate X=' + target.requestedEstimateX.toFixed(3)
            + ' Y=' + target.requestedEstimateY.toFixed(3)
            + ' current nozzle=' + formatLocation(nozzle.location)
            + ' dry_run=' + dryRun);
        if (dryRun) {
            print('Dry run active: moving above first pick target only. Create/remove control/pick_dry_run.flag to toggle.');
            moveNozzleToXyAtZ(nozzle, target.x, target.y, travelZ);
            print('Dry run finished above target. No Z descent, no vacuum, no drop move.');
        }
    }

    function waitForSegmentation(scanDir, timeoutMs) {
        var completeFile = new File(scanDir, 'segmentation_complete.json');
        var start = new Date().getTime();
        while (!completeFile.exists()) {
            if ((new Date().getTime() - start) > timeoutMs) {
                print('Timed out waiting for segmentation: ' + completeFile.getAbsolutePath());
                return false;
            }
            Packages.java.lang.Thread.sleep(500);
        }
        return true;
    }

    function readPickTargets(scanDir) {
        var objectsFile = new File(scanDir, 'objects.jsonl');
        var targets = [];
        if (!objectsFile.exists()) {
            print('No objects.jsonl found for pick sequence: ' + objectsFile.getAbsolutePath());
            return targets;
        }

        var reader = new BufferedReader(new FileReader(objectsFile));
        try {
            var line = reader.readLine();
            while (line !== null) {
                line = String(line).trim();
                if (line.length > 0) {
                    try {
                        var record = JSON.parse(line);
                        var pickX = record.pick_x_mm !== undefined ? record.pick_x_mm : record.estimated_x_mm;
                        var pickY = record.pick_y_mm !== undefined ? record.pick_y_mm : record.estimated_y_mm;
                        if (pickX !== undefined && pickY !== undefined) {
                            targets.push({
                                objectIndex: record.object_index,
                                x: Number(pickX),
                                y: Number(pickY),
                                frameX: Number(record.frame_x_mm),
                                frameY: Number(record.frame_y_mm),
                                requestedFrameX: Number(record.frame_requested_x_mm),
                                requestedFrameY: Number(record.frame_requested_y_mm),
                                requestedEstimateX: Number(record.requested_frame_estimated_x_mm),
                                requestedEstimateY: Number(record.requested_frame_estimated_y_mm),
                                score: Number(record.score || 0)
                            });
                        }
                    }
                    catch (parseError) {
                        print('Skipping unreadable object record: ' + parseError);
                    }
                }
                line = reader.readLine();
            }
        }
        finally {
            reader.close();
        }

        targets.sort(function(a, b) {
            return b.score - a.score;
        });
        return deduplicateTargets(targets, 5.0);
    }

    function deduplicateTargets(targets, minimumDistanceMm) {
        var unique = [];
        for (var i = 0; i < targets.length; i++) {
            var target = targets[i];
            var duplicate = false;
            for (var j = 0; j < unique.length; j++) {
                var dx = target.x - unique[j].x;
                var dy = target.y - unique[j].y;
                if (Math.sqrt((dx * dx) + (dy * dy)) < minimumDistanceMm) {
                    duplicate = true;
                    break;
                }
            }
            if (!duplicate) {
                unique.push(target);
            }
        }
        unique.sort(function(a, b) {
            if (a.y === b.y) {
                return a.x - b.x;
            }
            return a.y - b.y;
        });
        return unique;
    }

    function pickAndDropTargets(scanDir, pauseFile, stopFile, statusFile, scanId, totalFrames) {
        var pickHeadName = 'H1';
        var pickNozzleName = 'N1';
        var pickNozzleLabel = 'left nozzle N1';
        var pickZ = 6.0;
        var dropX = 100.0;
        var dropY = 200.0;
        var dropZ = 6.0;
        var dryRunFile = new File('/home/sean/Documents/OpenInvert-PnP/control/pick_dry_run.flag');
        var dryRun = dryRunFile.exists();
        var pickTool = findPickTool(pickHeadName, pickNozzleName);
        var nozzle = pickTool.nozzle;
        var vacuumActuator = findVacuumActuator(pickTool.head, nozzle);
        var travelZ = nozzle.location.z;
        var targets = readPickTargets(scanDir);

        print('Pick sequence has ' + targets.length + ' unique target(s).');
        print('Pick tool is ' + pickNozzleLabel + ' on head ' + pickHeadName
            + '; travel Z for XY moves: ' + travelZ.toFixed(3));
        if (dryRun) {
            print('Pick dry run flag is present: ' + dryRunFile.getAbsolutePath());
        }
        if (targets.length === 0) {
            writeStatus(statusFile, 'completed', scanId, totalFrames, totalFrames, 'Scan completed; no pick targets found');
            return;
        }

        for (var i = 0; i < targets.length; i++) {
            if (!waitWhilePaused(pauseFile, stopFile, statusFile, scanId, i, targets.length)
                    || haltRequested(stopFile, statusFile, scanId, i, targets.length)) {
                print('Halt requested during pick sequence. Stopping before target ' + (i + 1) + '.');
                return;
            }

            var target = targets[i];
            writeStatus(
                statusFile,
                'picking',
                scanId,
                i + 1,
                targets.length,
                'Picking target at X ' + target.x.toFixed(3) + ', Y ' + target.y.toFixed(3)
            );

            debugPickTarget(scanDir, target, nozzle, travelZ, dryRun);
            if (dryRun) {
                writeStatus(statusFile, 'paused', scanId, i + 1, targets.length, 'Dry run stopped above first pick target');
                return;
            }

            print('Moving ' + pickNozzleLabel + ' above object ' + target.objectIndex
                + ' using recorded scan coordinates X=' + target.x.toFixed(3)
                + ' Y=' + target.y.toFixed(3)
                + ' at travel Z=' + travelZ.toFixed(3));
            moveNozzleToXyAtZ(nozzle, target.x, target.y, travelZ);

            print('Descending to pick object ' + target.objectIndex
                + ' at X=' + target.x.toFixed(3)
                + ' Y=' + target.y.toFixed(3)
                + ' Z=' + pickZ.toFixed(3));
            moveNozzleToXyAtZ(nozzle, target.x, target.y, pickZ);
            setVacuum(vacuumActuator, true);
            moveNozzleToXyAtZ(nozzle, target.x, target.y, travelZ);

            print('Moving ' + pickNozzleLabel + ' above drop location for object ' + target.objectIndex
                + ' at X=' + dropX.toFixed(3)
                + ' Y=' + dropY.toFixed(3)
                + ' travel Z=' + travelZ.toFixed(3));
            moveNozzleToXyAtZ(nozzle, dropX, dropY, travelZ);

            print('Descending to drop object ' + target.objectIndex
                + ' at X=' + dropX.toFixed(3)
                + ' Y=' + dropY.toFixed(3)
                + ' Z=' + dropZ.toFixed(3));
            moveNozzleToXyAtZ(nozzle, dropX, dropY, dropZ);
            setVacuum(vacuumActuator, false);
            moveNozzleToXyAtZ(nozzle, dropX, dropY, travelZ);
        }

        writeStatus(statusFile, 'completed', scanId, totalFrames, totalFrames, 'Scan and pick/drop sequence completed');
    }

    task(function() {
        var camera = machine.defaultHead.defaultCamera;
        if (camera.getName() !== 'Top') {
            camera = machine.getCameraByName('Top');
        }

        var xLeft = 361.0;
        var xRight = 411.0;
        var yTop = 208.0;
        var yBottom = 319.0;
        var cameraXOffsetMm = -23.0;
        var cameraYOffsetMm = 64.0;

        var xStepMm = 12.0;
        var yStepMm = 9.5;

        var controlDir = new File('/home/sean/Documents/OpenInvert-PnP/control');
        var pauseFile = new File(controlDir, 'pause.flag');
        var stopFile = new File(controlDir, 'stop.flag');
        var pickDryRunFile = new File(controlDir, 'pick_dry_run.flag');
        var statusFile = new File(controlDir, 'scan_status.json');
        var detectionStatusFile = new File(controlDir, 'detection_status.json');
        var outputRoot = new File('/home/sean/Documents/OpenInvert-PnP/scans');
        var scanId = 'scan_' + timestamp();
        controlDir.mkdirs();
        if (stopFile.exists()) {
            stopFile.delete();
        }
        launchHaltGui(controlDir);

        var scanDir = new File(outputRoot, scanId);
        var framesDir = new File(scanDir, 'frames');
        framesDir.mkdirs();

        var manifestFile = new File(scanDir, 'manifest.jsonl');
        var manifest = new FileWriter(manifestFile);
        var xs = positions(xLeft, xRight, xStepMm, false);
        var ys = positions(yTop, yBottom, yStepMm, false);
        var frameIndex = 0;
        var totalFrames = xs.length * ys.length;

        print('Starting Top camera scan: ' + scanId);
        print('Frames directory: ' + framesDir.getAbsolutePath());
        print('Grid: ' + xs.length + ' columns x ' + ys.length + ' rows');
        print('Camera X compensation: ' + cameraXOffsetMm.toFixed(3) + ' mm');
        print('Camera Y compensation: +' + cameraYOffsetMm.toFixed(3) + ' mm');
        print('Cooperative pause flag: ' + pauseFile.getAbsolutePath());
        print('Cooperative halt flag: ' + stopFile.getAbsolutePath());
        print('Pick dry run flag: ' + pickDryRunFile.getAbsolutePath()
            + ' exists=' + pickDryRunFile.exists());
        writeStatus(
            statusFile,
            'running',
            scanId,
            frameIndex,
            totalFrames,
            pickDryRunFile.exists() ? 'Scan started with pick dry run enabled' : 'Scan started'
        );
        writeText(detectionStatusFile, JSON.stringify({
            status: 'scan_running',
            scan_dir: scanDir.getPath(),
            scan_id: scanId,
            preview_file: null,
            message: 'New scan is running; no current detection preview yet',
            updated_at: new Date().toISOString()
        }, null, 2) + '\n');
        launchSegmentation(scanDir, controlDir);

        var cameraLocation = camera.getLocation();
        var unitsPerPixel = getUnitsPerPixelForCurrentZ(camera);
        print('Top camera location at scan start: ' + formatLocation(cameraLocation));
        print('First requested scan coordinate is X=' + xs[0].toFixed(3) + ' Y=' + ys[0].toFixed(3));
        print('First commanded camera target will be X=' + (xs[0] + cameraXOffsetMm).toFixed(3)
            + ' Y=' + (ys[0] + cameraYOffsetMm).toFixed(3));

        var halted = false;
        try {
            for (var row = 0; row < ys.length; row++) {
                var leftToRight = (row % 2) === 0;

                for (var col = 0; col < xs.length; col++) {
                    if (!waitWhilePaused(pauseFile, stopFile, statusFile, scanId, frameIndex, totalFrames)
                            || haltRequested(stopFile, statusFile, scanId, frameIndex, totalFrames)) {
                        halted = true;
                        return;
                    }

                    var requestedX = leftToRight ? xs[col] : xs[xs.length - 1 - col];
                    var requestedY = ys[row];
                    var x = requestedX + cameraXOffsetMm;
                    var y = requestedY + cameraYOffsetMm;
                    var currentCameraLocation = camera.getLocation();
                    var location = currentCameraLocation.add(new Location(
                        LengthUnit.Millimeters,
                        x - currentCameraLocation.x,
                        y - currentCameraLocation.y,
                        0,
                        0
                    ));

                    print('Moving Top camera to frame ' + frameIndex
                        + ' target X=' + x.toFixed(3)
                        + ' Y=' + y.toFixed(3)
                        + ' requested X=' + requestedX.toFixed(3)
                        + ' Y=' + requestedY.toFixed(3));
                    camera.moveTo(location);
                    print('Top camera after move: ' + formatLocation(camera.getLocation()));
                    var image = camera.settleAndCapture();
                    var fileName = 'frame_' + pad(frameIndex, 5)
                        + '_x' + x.toFixed(2)
                        + '_y' + y.toFixed(2)
                        + '.png';
                    var imageFile = new File(framesDir, fileName);

                    ImageIO.write(image, 'PNG', imageFile);
                    manifest.write(jsonLine(
                        frameIndex,
                        'frames/' + fileName,
                        x,
                        y,
                        requestedX,
                        requestedY,
                        image.getWidth(),
                        image.getHeight(),
                        unitsPerPixel
                    ));
                    manifest.flush();

                    print('Captured ' + fileName);
                    frameIndex++;
                    writeStatus(statusFile, 'running', scanId, frameIndex, totalFrames, 'Captured ' + fileName);
                }
            }
        }
        finally {
            manifest.close();
        }

        if (!halted) {
            writeStatus(statusFile, 'completed', scanId, frameIndex, totalFrames, 'Scan completed; waiting for target segmentation');
            print('Completed Top camera scan: ' + scanDir.getAbsolutePath());
            if (waitForSegmentation(scanDir, 120000)) {
                print('Segmentation complete. Starting left nozzle N1 pick/drop sequence.');
                pickAndDropTargets(scanDir, pauseFile, stopFile, statusFile, scanId, totalFrames);
            }
        }
    });
}
