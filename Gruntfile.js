module.exports = function(grunt) {
    // Load tasks
    grunt.loadNpmTasks('grunt-sass');
    grunt.loadNpmTasks('grunt-contrib-watch');
    grunt.loadNpmTasks('grunt-concurrent');
    grunt.loadNpmTasks('grunt-run');
  
    // Configure tasks
    grunt.initConfig({
      // Compile Sass to CSS
      sass: {
        options: {
          implementation: require('sass')
        },
        dist: {
          files: {
            'styles.css': 'styles.scss'
          }
        }
      },
      // Watch for changes in Sass files
      watch: {
        sass: {
          files: ['styles.scss'],
          tasks: ['sass'],
          options: {
            spawn: false,
          },
        },
      },
      // Run npm start command
      run: {
        start: {
          exec: 'npm start'
        }
      },
      // Run tasks concurrently
      concurrent: {
        dev: {
          tasks: ['watch', 'run:start'],
          options: {
            logConcurrentOutput: true
          }
        }
      }
    });
  
    // Default task: compile Sass then run watch and npm start concurrently
    grunt.registerTask('default', ['sass', 'concurrent:dev']);
  };
  