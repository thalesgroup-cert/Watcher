# Configuration file for the Sphinx documentation builder.
#
# This file only contains a selection of the most common options. For a full
# list see the documentation:
# https://www.sphinx-doc.org/en/master/usage/configuration.html

# -- Path setup --------------------------------------------------------------

# If extensions (or modules to document with autodoc) are in another directory,
# add these directories to sys.path here. If the directory is relative to the
# documentation root, use os.path.abspath to make it absolute, like shown here.
#
import django
import os
import sys

from django.conf import settings

sys.path.insert(0, os.path.abspath('../'))
settings.configure()
django.setup()

# -- Project information -----------------------------------------------------

project = 'Watcher'
author = 'Ygal Nezri, Félix Herrenschmidt & Damien Marechal'

# The full version, including alpha/beta/rc tags
release = '3.5.2'

copyright = '2026 - Thales CERT'

# -- General configuration ---------------------------------------------------

# Add any Sphinx extension module names here, as strings. They can be
# extensions coming with Sphinx (named 'sphinx.ext.*') or your custom
# ones.
extensions = [
    'sphinx.ext.autodoc',
    'myst_parser',
]

# Add any paths that contain templates here, relative to this directory.
templates_path = ['_templates']

# List of patterns, relative to source directory, that match files and
# directories to ignore when looking for source files.
# This pattern also affects html_static_path and html_extra_path.
exclude_patterns = ['_build', 'Thumbs.db', '.DS_Store']

# -- Options for HTML output -------------------------------------------------

# The theme to use for HTML and HTML Help pages.  See the documentation for
# a list of builtin themes.
#
html_theme = 'sphinxawesome_theme'

html_logo = '../static/Watcher-logo-documentation.png'
html_favicon = '../static/Watcher-favicon.ico'

html_permalinks_icon = '<svg width="0.65em" height="0.65em" viewBox="0 0 24 24" style="fill: none !important; stroke: currentColor !important; stroke-width: 1.5px !important;" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>'

myst_heading_anchors = 3
