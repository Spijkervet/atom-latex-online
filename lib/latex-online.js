'use babel';

import { CompositeDisposable } from 'atom';
import request from 'request'
import fs from 'fs'
import path from 'path'

const opn = require('opn');


var archiver = require('archiver');

var MessagePanelView = require('atom-message-panel').MessagePanelView,
PlainMessageView = require('atom-message-panel').PlainMessageView;


export default {

  // atomPackageView: null,
  // modalPanel: null,
  subscriptions: null,

  activate(state) {
    // this.atomPackageView = new AtomPackageView(state.atomPackageViewState);
    // this.modalPanel = atom.workspace.addModalPanel({
    //   item: this.atomPackageView.getElement(),
    //   visible: false
    // });

    // Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
    this.subscriptions = new CompositeDisposable();

    // Register command that toggles this view
    this.subscriptions.add(atom.commands.add('atom-workspace', {
      'latex-online:fetch': () => this.fetch()
    }));
  },

  deactivate() {
    // this.modalPanel.destroy();
    // this.subscriptions.dispose();
    // this.atomPackageView.destroy();
  },

  message(message, details='', error=false) {

    if (!error) {
      // messages.add(new PlainMessageView({
      //   message: message,
      //   className: 'text-success'
      // }));
      atom.notifications.addSuccess(message, {
        // buttons: [
        //   {
        //     className: "btn-details",
        //     onDidClick: function() {},
        //     text: "Details"
        //   }
        // ],
        detail: details
      })
    }
    else {
      var messages = new MessagePanelView({
        title: 'Atom LaTeX Online'
      });
      messages.attach();
      messages.add(new PlainMessageView({
        message: message,
        className: 'text-error'
      }));
      atom.notifications.addError(message, {
        // buttons: [
        //   {
        //     className: "btn-details",
        //     onDidClick: function() {},
        //     text: "Details"
        //   }
        // ],
        detail: details
      })
    }

  },


  download(url, dest) {
    filePath = atom.workspace.getActivePaneItem().buffer.file.path;
    let projectPath = "";
    atom.project.getDirectories().forEach(function(dir){
      if (dir.contains(filePath)) {
        projectPath = dir.path;
      }
    });
    console.log(projectPath);
    dest = path.join(projectPath, dest);

    var file = fs.createWriteStream(dest);
    var sendReq = request.get(url);

    console.log(sendReq);
    // verify response code
    sendReq.on('response', function(response) {
      if (response.statusCode !== 200) {
        return console.log('Response status was ' + response.statusCode);
      }
    });

    // check for request errors
    sendReq.on('error', function (err) {
      fs.unlink(dest);
      return console.log(err.message);
    });

    sendReq.pipe(file);
    parent = this
    file.on('finish', function() {
      console.log('done, now opening file.')
      parent.open(dest)

    });

    file.on('error', function(err) { // Handle errors
      fs.unlink(dest); // Delete the file async. (But we don't check the result)
      return cb(err.message);
    });
  },

  fetch() {
    this.url = atom.config.get('latex-online.server_url')

    if(!this.url) {
      message("No server URL specified in settings", true)
      return
    }

    let editor
    if (editor = atom.workspace.getActiveTextEditor()) {


      let selection = editor.getSelectedText()
      editor = atom.workspace.getActivePaneItem()
      file = editor.buffer.file

      filename = file.getBaseName()
      save_path = filename.substr(0, filename.lastIndexOf('.')) + '.pdf'

      working_dir = path.dirname(file.path)

      parent = this;

      output_zip_path = working_dir + '/output.zip'
      var output_compressed = fs.createWriteStream(output_zip_path);

      var archive = archiver('zip', {
        zlib: { level: 9 } // Sets the compression level.
      });

      archive.on('error', function(err) {
        throw err;
      });

      // files = fs.readdirSync(working_dir)
      // for (var i = 0; i < files.length; i++) {
      //   full_path = path.join(working_dir, files[i])
      //   archive.file(full_path, { name: files[i] });
      // }

      rel_working_dir = path.basename(working_dir)
      archive.directory(working_dir, '');

      archive.pipe(output_compressed);
      archive.finalize();

      output_compressed.on('close', function() {
        console.log(archive.pointer() + ' total bytes');
        console.log('archiver has been finalized and the output file descriptor has closed.');

        // return
        var formData = {
          // Pass a simple key-value pair
          compile_file: file.getBaseName(),
          // Pass data via Buffers
          my_buffer: new Buffer([1, 2, 3]),
          // Pass data via Streams
          file: fs.createReadStream(output_zip_path) //file.path)
          // Pass multiple values /w an Array
          // attachments: [
          //   fs.createReadStream(__dirname + '/attachment1.jpg'),
          //   fs.createReadStream(__dirname + '/attachment2.jpg')
          // ],
          // custom_file: {
          //   value:  fs.createReadStream('/dev/urandom'),
          //   options: {
          //     filename: 'topsecret.jpg',
          //     contentType: 'image/jpeg'
          //   }
          // }
        };


        request.post({url:parent.url, formData: formData}, function optionalCallback(err, httpResponse, body) {
          if (err) {
            parent.message('Failed to upload to: ' + parent.url, err, true)
            return console.error('upload failed:', err);
          }
          console.log('Upload successful!  Server responded with:', body);
          var return_json = JSON.parse(body)
          console.log(return_json)

          if (return_json.status == 200 && return_json.url) {
            parent.download(return_json.url, save_path)
            parent.message('Successfully converted LaTex file to ' + save_path)
          }
          else if (return_json.status == 500) {
            if (!return_json.errors) {
              return;
            }
            error_str = ''
            for (var i = 0; i < return_json.errors.length; i++) {
              for (var j = 0; j < return_json.errors[i].length; j++) {
                error_str += return_json.errors[i][j]
              }
            }
            parent.message(error_str, '', error=true);
          }
        });
      });
    }
  },

  open(file_path) {
    found = false
    file_name = path.basename(file_path)
    console.log(atom.workspace.getPaneItems())
    items = atom.workspace.getPaneItems()
    for (i = 0; i < items.length; i++ ) {
      if (items[i].filePath) {
        panel_file_name = path.basename(items[i].filePath)
        console.log(file_name, panel_file_name)
        if (file_name == panel_file_name) {
          found = true
          break
        }
      }
    }

    if (!found) {
      atom.workspace.open(file_path, newWindow=false)
    }

  }
};
