const express = require("express");
const fsPromise = require("fs/promises");
const fs = require("fs");
const path = require("path");
const busboy = require("busboy");
const compressing = require("compressing");

const app = express();

const root = "d:/projects";
const port = 8797;

app.use(express.json());

app.use((req, res, next) => {
  const queryPath = req.query.path ?? "/";
  const realPath = path.join(root, queryPath);
  req.locals = {
    realPath,
  };
  next();
});

app.get("/dir", (req, res, next) => {
  (async () => {
    const fileNames = await fsPromise.readdir(req.locals.realPath);
    const results = [];
    for (const fileName of fileNames) {
      const state = await fsPromise.stat(
        path.join(req.locals.realPath, fileName)
      );
      results.push({
        name: fileName,
        size: state.size,
        ctime: state.ctimeMs,
        mtime: state.mtime,
        isDirectory: state.isDirectory(),
      });
    }
    res.json({
      success: true,
      data: results,
    });
  })().catch(next);
});

app.post("/dir", (req, res, next) => {
  (async () => {
    await fsPromise.mkdir(req.locals.realPath);
    res.json({
      success: true,
    });
  })().catch(next);
});

app.get("/file", (req, res, next) => {
  (async () => {
    const content = await fsPromise.readFile(req.locals.realPath);
    res.json({
      success: true,
      data: content.toString(),
    });
  })().catch(next);
});

app.post("/file", (req, res, next) => {
  (async () => {
    const writeStream = fs.createWriteStream(req.locals.realPath);
    req.on("end", () => {
      res.json({
        success: true,
      });
    });
    req.on("error", next);
    req.pipe(writeStream);
  })().catch(next);
});

app.delete("/file", (req, res, next) => {
  (async () => {
    const stats = await fs.promises.stat(req.locals.realPath);
    if (stats.isFile()) {
      await fsPromise.unlink(req.locals.realPath);
    } else {
      await fsPromise.rmdir(req.locals.realPath, {
        maxRetries: 5,
        retryDelay: 200,
        recursive: true,
      });
    }

    return res.json({
      success: true,
    });
  })().catch(next);
});

app.post("/file/rename", (req, res, next) => {
  (async () => {
    const data = req.body;
    await fsPromise.rename(
      path.join(root, data.oldName),
      path.join(root, data.newName)
    );
    res.json({
      success: true,
    });
  })().catch(next);
});

app.get("/stat", (req, res) => {
  (async () => {
    const state = await fsPromise.stat(req.locals.realPath);
    res.json({
      success: true,
      data: {
        isDirectory: state.isDirectory(),
        size: state.size,
        ctime: state.ctime,
        mtime: state.mtime,
      },
    });
  })().catch(() => {
    res.json({
      success: false,
    });
  });
});

app.get("/zip", (req, res, next) => {
  (async () => {
    const stats = await fsPromise.stat(req.locals.realPath);
    res.attachment(path.basename(req.locals.realPath) + ".zip");

    let stream;
    if (stats.isDirectory()) {
      stream = new compressing.zip.Stream();
      stream.pipe(res);
      stream.addEntry(req.locals.realPath);
    } else {
      new compressing.zip.FileStream({ source: req.locals.realPath }).pipe(res);
    }
  })().catch(next);
});

app.post("/upload", (req, res, next) => {
  (async () => {
    const realPath = req.locals.realPath;
    try {
      const stats = await fsPromise.stat(realPath);
      if (stats.isFile()) {
        next(new Error("the path is a file and its exist"));
        return;
      }
    } catch (e) {
      await fsPromise.mkdir(realPath, {
        recursive: true,
      });
    }

    const bb = busboy({ headers: req.headers });
    bb.on("file", async (name, file, info) => {
      const { filename, encoding, mimeType } = info;
      const filepath = path.join(realPath, filename);

      const writeStream = fs.createWriteStream(filepath);
      file.pipe(writeStream);
    });

    bb.on("close", () => {
      res.json({
        success: true,
      });
    });
    req.pipe(bb);
  })().catch(next);
});

app.use((err, req, res, next) => {
  console.error(err);
  res.json({
    success: false,
    msg: err.message,
  });
});

app.listen(port, () => console.log(`the server is running at ${port} ....`));
